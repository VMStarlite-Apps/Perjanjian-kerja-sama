// Autentikasi internal lewat Cloudflare Access (JWT diverifikasi), mode dev memakai DEV_USER_EMAIL.
import { b64urlDecode, fail } from './util.js';

let certCache = null;

async function accessKeys(teamDomain) {
  if (certCache && certCache.exp > Date.now()) return certCache.keys;
  const r = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error('Gagal mengambil sertifikat Access');
  const { keys } = await r.json();
  certCache = { keys, exp: Date.now() + 3600_000 };
  return keys;
}

async function verifyAccessJwt(env, jwt) {
  const [h, p, s] = jwt.split('.');
  if (!h || !p || !s) return null;
  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
  const jwk = (await accessKeys(env.ACCESS_TEAM_DOMAIN)).find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) return null;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) return null;
  if (payload.exp * 1000 < Date.now()) return null;
  return payload.email?.toLowerCase() || null;
}

export async function resolveEmail(c) {
  const env = c.env;
  if (env.APP_ENV === 'dev' && env.DEV_USER_EMAIL) {
    return (c.req.header('x-dev-user') || env.DEV_USER_EMAIL).toLowerCase();
  }
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) fail(500, 'Cloudflare Access belum dikonfigurasi');
  const jwt = c.req.header('cf-access-jwt-assertion');
  if (!jwt) fail(401, 'Silakan masuk lewat akun Google perusahaan');
  const email = await verifyAccessJwt(env, jwt);
  if (!email) fail(401, 'Sesi tidak valid, silakan masuk ulang');
  return email;
}

export async function requireUser(c) {
  const email = await resolveEmail(c);
  const u = await c.env.DB.prepare('SELECT email, nama, peran, penandatangan FROM pks_pengguna WHERE email = ? AND aktif = 1').bind(email).first();
  if (!u) fail(403, `Akun ${email} belum terdaftar di Starlite. Hubungi Admin.`);
  return u;
}

export function allow(user, ...roles) {
  if (user.peran === 'admin') return;
  if (!roles.includes(user.peran)) fail(403, 'Peran Anda tidak memiliki akses untuk tindakan ini');
}
