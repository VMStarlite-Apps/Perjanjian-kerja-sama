// Integrasi Google (OAuth refresh token akun Vendor Management): Drive untuk berkas, Gmail untuk email.
import { b64, b64url, b64urlDecode, uid } from './util.js';

let tokenCache = null;

export const googleEnabled = (env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN);

async function accessToken(env) {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.tok;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token',
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('Token Google gagal: ' + (j.error_description || j.error));
  tokenCache = { tok: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return tokenCache.tok;
}

async function gfetch(env, url, init = {}, raw = false) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const tok = await accessToken(env);
    const r = await fetch(url, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${tok}` } });
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 400 * 2 ** attempt)); continue; }
    if (!r.ok) throw new Error(`Google ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return raw ? r : r.json();
  }
  throw new Error('Google sibuk, coba lagi');
}

// ---------- Drive ----------
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const q = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export async function driveEnsureFolder(env, parentId, name) {
  const query = `'${parentId}' in parents and name='${q(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const found = await gfetch(env, `${DRIVE}?q=${encodeURIComponent(query)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  if (found.files?.length) return found.files[0].id;
  const created = await gfetch(env, `${DRIVE}?supportsAllDrives=true&fields=id`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  return created.id;
}

export async function drivePath(env, segments) {
  let parent = env.DRIVE_ROOT_FOLDER;
  for (const s of segments) parent = await driveEnsureFolder(env, parent, s);
  return parent;
}

export async function driveUpload(env, folderId, name, mime, bytes) {
  const tok = await accessToken(env);
  const init = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id', {
    method: 'POST',
    headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': mime, 'x-upload-content-length': String(bytes.length) },
    body: JSON.stringify({ name, parents: [folderId] }),
  });
  if (!init.ok) throw new Error('Drive upload gagal: ' + (await init.text()).slice(0, 200));
  const loc = init.headers.get('location');
  const put = await fetch(loc, { method: 'PUT', headers: { 'content-type': mime }, body: bytes });
  if (!put.ok) throw new Error('Drive upload gagal: ' + (await put.text()).slice(0, 200));
  return (await put.json()).id;
}

export async function driveDownload(env, fileId) {
  const r = await gfetch(env, `${DRIVE}/${fileId}?alt=media&supportsAllDrives=true`, {}, true);
  return new Uint8Array(await r.arrayBuffer());
}

// ---------- Gmail ----------
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';

const encWord = (s) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(new TextEncoder().encode(s))}?=`;
const wrap76 = (s) => s.replace(/.{1,76}/g, '$&\r\n');

export function buildMime({ from, to, cc = [], subject, html, attachments = [], inReplyTo }) {
  const boundary = 'b_' + uid();
  const h = [
    `From: ${from}`, `To: ${to.join(', ')}`, cc.length ? `Cc: ${cc.join(', ')}` : null,
    `Subject: ${encWord(subject)}`, 'MIME-Version: 1.0',
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null, inReplyTo ? `References: ${inReplyTo}` : null,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ].filter(Boolean);
  let body = `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(b64(new TextEncoder().encode(html)))}`;
  for (const a of attachments) {
    body += `--${boundary}\r\nContent-Type: ${a.mime}; name="${encWord(a.name)}"\r\nContent-Disposition: attachment; filename="${encWord(a.name)}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(b64(a.bytes))}`;
  }
  body += `--${boundary}--`;
  return h.join('\r\n') + '\r\n\r\n' + body;
}

export async function gmailSend(env, msg, threadId) {
  const raw = b64url(new TextEncoder().encode(buildMime(msg)));
  return gfetch(env, `${GMAIL}/messages/send`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
  });
}

function textFromPayload(p) {
  if (!p) return '';
  if (p.mimeType === 'text/plain' && p.body?.data) return new TextDecoder().decode(b64urlDecode(p.body.data));
  for (const part of p.parts || []) { const t = textFromPayload(part); if (t) return t; }
  return '';
}

/** Ambil balasan di thread yang bukan dari akun kita. */
export async function gmailThreadReplies(env, threadId, ourAddress) {
  const t = await gfetch(env, `${GMAIL}/threads/${threadId}?format=full`);
  const out = [];
  for (const m of t.messages || []) {
    const hdr = Object.fromEntries((m.payload?.headers || []).map((x) => [x.name.toLowerCase(), x.value]));
    const from = hdr.from || '';
    if (from.toLowerCase().includes(ourAddress.toLowerCase())) continue;
    let text = textFromPayload(m.payload).split(/\r?\n(?:On .+wrote:|Pada .+menulis:|-----Original Message-----)/)[0].trim();
    out.push({ id: m.id, from, text: text.slice(0, 5000) || '(tanpa isi teks)', at: new Date(Number(m.internalDate)).toISOString() });
  }
  return out;
}
