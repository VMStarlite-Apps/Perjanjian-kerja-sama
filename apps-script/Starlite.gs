/**
 * Starlite — jembatan Google (Drive + Gmail) untuk akun vendor.management@weave.co.id
 * Dipasang sebagai Web App oleh pemilik akun tersebut. Dipanggil Worker Starlite lewat POST JSON.
 *
 * Properti Skrip (Project Settings → Script properties):
 *   KEY               wajib  kunci rahasia, sama dengan secret APPS_SCRIPT_KEY di Worker
 *   DRIVE_ROOT_FOLDER opsional  ID folder induk Drive (bawaan: folder Starlite di bawah)
 */
const DEFAULT_ROOT = '1vJu2toTDvc6-ReOtxPgd-RP_ckBUw6dp';

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function root_() { return prop_('DRIVE_ROOT_FOLDER') || DEFAULT_ROOT; }

function safeEq_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Berkas/folder hanya boleh di dalam folder induk Starlite.
function inRoot_(item) {
  const root = root_();
  let cur = [item];
  for (let depth = 0; depth < 8 && cur.length; depth++) {
    const next = [];
    for (const it of cur) {
      if (it.getId() === root) return true;
      const ps = it.getParents();
      while (ps.hasNext()) next.push(ps.next());
    }
    cur = next;
  }
  return false;
}

function ensureFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  while (it.hasNext()) { const f = it.next(); if (!f.isTrashed()) return f; }
  return parent.createFolder(name);
}

const actions_ = {
  ping() {
    return { email: Session.getEffectiveUser().getEmail(), root: root_() };
  },

  drive_path(p) {
    if (!Array.isArray(p.segments) || p.segments.length > 6) throw new Error('segments tidak valid');
    let f = DriveApp.getFolderById(root_());
    for (const s of p.segments) {
      const name = String(s).trim();
      if (!name || name.length > 150) throw new Error('nama folder tidak valid');
      f = ensureFolder_(f, name);
    }
    return { id: f.getId() };
  },

  drive_upload(p) {
    const folder = DriveApp.getFolderById(p.folderId);
    if (!inRoot_(folder)) throw new Error('folder di luar folder induk');
    const blob = Utilities.newBlob(Utilities.base64Decode(p.b64), p.mime || 'application/octet-stream', p.name);
    return { id: folder.createFile(blob).getId() };
  },

  drive_download(p) {
    const file = DriveApp.getFileById(p.id);
    if (!inRoot_(file)) throw new Error('berkas di luar folder induk');
    return { b64: Utilities.base64Encode(file.getBlob().getBytes()) };
  },

  // raw = pesan MIME base64url (dibuat Worker); kirim dari akun pemilik skrip.
  gmail_send(p) {
    const res = Gmail.Users.Messages.send(p.threadId ? { raw: p.raw, threadId: p.threadId } : { raw: p.raw }, 'me');
    return { id: res.id, threadId: res.threadId };
  },

  gmail_thread(p) {
    return Gmail.Users.Threads.get('me', p.threadId, { format: 'full' });
  },
};

function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const key = prop_('KEY');
    if (!key || !safeEq_(String(req.key || ''), key)) return out_({ ok: false, error: 'tidak berwenang' });
    const fn = actions_[req.action];
    if (!fn) return out_({ ok: false, error: 'aksi tidak dikenal' });
    return out_({ ok: true, data: fn(req) });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message ? err.message : err).slice(0, 300) });
  }
}

// Buka URL di browser → hanya penanda hidup, tanpa data.
function doGet() { return out_({ ok: true, app: 'starlite-bridge' }); }
