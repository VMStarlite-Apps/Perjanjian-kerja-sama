// Penyimpanan berkas: Google Drive (produksi) atau tabel pks_blob (mode pengembangan tanpa kredensial).
import { googleEnabled, drivePath, driveUpload, driveDownload } from './google.js';
import { uid, fail } from './util.js';

const DEV_MAX = 1_900_000; // batas BLOB D1 ~2 MB

const safe = (s) => String(s).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

export const FOLDER = { master: '01 Master', bernomor: '03 Bernomor', ttd_mitra: '04 TTD Mitra', final: '05 Final', lampiran: '02 Feedback' };

export async function putFile(env, { mitraNama, kode, jenis, name, mime, bytes }) {
  if (googleEnabled(env)) {
    const folder = await drivePath(env, [safe(mitraNama), safe(kode), FOLDER[jenis] || '99 Lain']);
    const id = await driveUpload(env, folder, safe(name), mime, bytes);
    return { storage: 'drive', storage_id: id };
  }
  if (env.APP_ENV !== 'dev') fail(500, 'Kredensial Google Drive belum dipasang');
  if (bytes.length > DEV_MAX) fail(413, 'Mode pengembangan: berkas maksimal 1,9 MB');
  const id = uid('blob_');
  await env.DB.prepare('INSERT INTO pks_blob (id, data) VALUES (?, ?)').bind(id, bytes).run();
  return { storage: 'dev', storage_id: id };
}

export async function getFile(env, doc) {
  if (doc.storage === 'drive') return driveDownload(env, doc.storage_id);
  const r = await env.DB.prepare('SELECT data FROM pks_blob WHERE id = ?').bind(doc.storage_id).first();
  if (!r) fail(404, 'Berkas tidak ditemukan');
  return new Uint8Array(r.data);
}
