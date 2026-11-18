// Login Starlite: email + password di database starlite-pks, sesi lewat cookie HttpOnly (token di-hash di DB).
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { fail, now, randomToken, sha256Hex } from './util.js';
import { hashPassword, verifyPassword, samaAman } from './password.js';

const COOKIE = 'starlite_sesi';
const SESI_JAM = 12;
const MAKS_GAGAL = 5;
const KUNCI_MENIT = 15;
const enc = new TextEncoder();
const secure = (env) => env.APP_ENV !== 'dev';

export async function buatSesi(c, email) {
  const token = randomToken(32);
  const t = Date.now();
  await c.env.DB.prepare('DELETE FROM pks_sesi WHERE kedaluwarsa < ?').bind(new Date(t).toISOString()).run();
  await c.env.DB.prepare('INSERT INTO pks_sesi (id, email, dibuat_pada, kedaluwarsa) VALUES (?,?,?,?)')
    .bind(await sha256Hex(token), email, new Date(t).toISOString(), new Date(t + SESI_JAM * 3600_000).toISOString()).run();
  setCookie(c, COOKIE, token, { httpOnly: true, secure: secure(c.env), sameSite: 'Lax', path: '/', maxAge: SESI_JAM * 3600 });
}

export async function akhiriSesi(c) {
  const token = getCookie(c, COOKIE);
  if (token) await c.env.DB.prepare('DELETE FROM pks_sesi WHERE id = ?').bind(await sha256Hex(token)).run();
  deleteCookie(c, COOKIE, { path: '/', secure: secure(c.env) });
}

export const cabutSemuaSesi = (env, email, kecuali = null) =>
  env.DB.prepare('DELETE FROM pks_sesi WHERE email = ? AND id != ?').bind(email, kecuali || '').run();

export async function sesiSaatIni(c) {
  const token = getCookie(c, COOKIE);
  return token ? sha256Hex(token) : null;
}

async function resolveEmail(c) {
  if (c.env.APP_ENV === 'dev' && c.req.header('x-dev-user')) return c.req.header('x-dev-user').toLowerCase();
  const id = await sesiSaatIni(c);
  if (!id) fail(401, 'Silakan masuk');
  const s = await c.env.DB.prepare('SELECT email FROM pks_sesi WHERE id = ? AND kedaluwarsa > ?').bind(id, now()).first();
  if (!s) fail(401, 'Sesi berakhir, silakan masuk lagi');
  return s.email;
}

/** Pengguna aktif dari sesi. Akun dengan password sementara hanya boleh ganti password (skipGanti = true untuk endpoint itu). */
export async function requireUser(c, { skipGanti = false } = {}) {
  const email = await resolveEmail(c);
  const u = await c.env.DB.prepare('SELECT email, nama, peran, penandatangan, wajib_ganti FROM pks_pengguna WHERE email = ? AND aktif = 1').bind(email).first();
  if (!u) fail(c.env.APP_ENV === 'dev' && c.req.header('x-dev-user') ? 403 : 401, `Akun ${email} belum terdaftar di Starlite atau dinonaktifkan. Hubungi Admin.`);
  if (u.wajib_ganti && !skipGanti) fail(403, 'Ganti password sementara Anda terlebih dahulu');
  return u;
}

export function allow(user, ...roles) {
  if (user.peran === 'admin') return;
  if (!roles.includes(user.peran)) fail(403, 'Peran Anda tidak memiliki akses untuk tindakan ini');
}

const SALAH = 'Email atau password salah';

/** Verifikasi login dengan penguncian akun setelah beberapa kali gagal. Mengembalikan email pengguna. */
export async function cekLogin(env, emailRaw, password) {
  const email = String(emailRaw || '').trim().toLowerCase();
  const pw = String(password || '');
  const u = await env.DB.prepare('SELECT email, peran, aktif, password_hash, gagal_login, terkunci_sampai FROM pks_pengguna WHERE email = ?').bind(email).first();
  if (u?.terkunci_sampai && u.terkunci_sampai > now()) {
    const mnt = Math.ceil((Date.parse(u.terkunci_sampai) - Date.now()) / 60000);
    fail(429, `Terlalu banyak percobaan. Coba lagi dalam ${mnt} menit.`);
  }
  let benar = false, awal = false;
  if (u?.aktif) {
    if (u.password_hash) benar = await verifyPassword(pw, u.password_hash);
    else if (u.peran === 'admin' && env.ADMIN_PASSWORD_AWAL && pw.length >= 8) {
      // Admin pertama yang belum punya password masuk dengan secret ADMIN_PASSWORD_AWAL lalu wajib menggantinya.
      benar = samaAman(enc.encode(pw.padEnd(256)), enc.encode(String(env.ADMIN_PASSWORD_AWAL).padEnd(256)));
      awal = benar;
    } else await hashPassword(pw); // samakan waktu respons
  } else await hashPassword(pw);
  if (!benar) {
    if (u) {
      const g = (u.gagal_login || 0) + 1;
      await env.DB.prepare('UPDATE pks_pengguna SET gagal_login = ?, terkunci_sampai = ? WHERE email = ?')
        .bind(g >= MAKS_GAGAL ? 0 : g, g >= MAKS_GAGAL ? new Date(Date.now() + KUNCI_MENIT * 60000).toISOString() : null, email).run();
    }
    fail(401, SALAH);
  }
  await env.DB.prepare('UPDATE pks_pengguna SET gagal_login = 0, terkunci_sampai = NULL' + (awal ? ', wajib_ganti = 1' : '') + ' WHERE email = ?').bind(email).run();
  return email;
}
