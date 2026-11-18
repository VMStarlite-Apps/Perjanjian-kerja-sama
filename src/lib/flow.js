// Inti alur perjanjian Starlite (tahap 0–7 + pasca-selesai).
import { now, uid, sha256Hex, randomToken, addWorkdays, addMonths, fail } from './util.js';
import { getMitra, snapshot } from './mitra.js';
import { putFile, getFile } from './storage.js';
import { pageCount, stampSignature } from './pdf.js';
import { sendMail, templates } from './mail.js';

export const TAHAP = [
  { n: 0, key: 'draf', nama: 'Draf' },
  { n: 1, key: 'dikirim', nama: 'Dikirim ke mitra' },
  { n: 2, key: 'feedback', nama: 'Feedback mitra' },
  { n: 3, key: 'di_legal', nama: 'Di Legal' },
  { n: 4, key: 'nomor_terbit', nama: 'Nomor terbit' },
  { n: 5, key: 'menunggu_ttd_mitra', nama: 'Menunggu TTD mitra' },
  { n: 6, key: 'ttd_mitra_diterima', nama: 'TTD mitra diterima' },
  { n: 7, key: 'selesai', nama: 'Selesai' },
];
const PIC_TAHAP = { 1: 'mitra', 2: 'vm', 3: 'legal', 4: 'vm', 5: 'mitra', 6: 'vm' };
const MAX_UPLOAD = 20 * 1024 * 1024;

export async function konfig(env) {
  const rows = (await env.DB.prepare('SELECT k, v FROM pks_konfig').all()).results;
  const k = Object.fromEntries(rows.map((r) => [r.k, r.v]));
  return {
    sla: JSON.parse(k.sla_hari_kerja || '{}'),
    formatNomor: new RegExp(k.format_nomor || '^.{3,80}$'),
    tokenHari: Number(k.token_hari || 30),
    batchAwal: JSON.parse(k.batch_awal || '[]'),
  };
}

export async function audit(env, aktor, perjanjianId, aksi, data = null) {
  await env.DB.prepare('INSERT INTO pks_audit (waktu, aktor, perjanjian_id, aksi, data) VALUES (?,?,?,?,?)')
    .bind(now(), aktor, perjanjianId, aksi, data ? JSON.stringify(data) : null).run();
}

export async function loadP(env, id) {
  const p = await env.DB.prepare('SELECT * FROM pks_perjanjian WHERE id = ?').bind(id).first();
  if (!p) fail(404, 'Perjanjian tidak ditemukan');
  p.mitra = JSON.parse(p.snapshot_mitra);
  return p;
}

const need = (p, ...tahap) => {
  if (p.status === 'batal') fail(409, 'Perjanjian sudah dibatalkan');
  if (!tahap.includes(p.tahap)) fail(409, `Tindakan tidak sesuai tahap saat ini (${TAHAP[p.tahap].nama})`);
};

async function setTahap(env, p, tahap, aktor, catatan = null) {
  const t = now();
  const cfg = await konfig(env);
  const sla = cfg.sla[String(tahap)];
  const tenggat = sla ? addWorkdays(t, sla) : null;
  await env.DB.batch([
    env.DB.prepare('UPDATE pks_tahap SET selesai = ? WHERE perjanjian_id = ? AND selesai IS NULL').bind(t, p.id),
    env.DB.prepare('INSERT INTO pks_tahap (perjanjian_id, tahap, mulai, tenggat, pic, catatan) VALUES (?,?,?,?,?,?)')
      .bind(p.id, tahap, t, tenggat, tahap === 7 ? null : PIC_TAHAP[tahap] || 'vm', catatan),
    env.DB.prepare('UPDATE pks_perjanjian SET tahap = ?, status = ?, tenggat = ?, diperbarui_pada = ? WHERE id = ?')
      .bind(tahap, TAHAP[tahap].key, tenggat, t, p.id),
  ]);
  if (tahap === 7) await env.DB.prepare('UPDATE pks_tahap SET selesai = ? WHERE perjanjian_id = ? AND tahap = 7').bind(t, p.id).run();
  Object.assign(p, { tahap, status: TAHAP[tahap].key, tenggat });
  return tenggat;
}

function checkFile(file, kinds) {
  if (!file || typeof file === 'string') fail(400, 'Berkas wajib diunggah');
  if (file.size > MAX_UPLOAD) fail(413, 'Ukuran berkas maksimal 20 MB');
  const mime = file.type || 'application/octet-stream';
  if (!kinds.includes(mime)) fail(400, `Format berkas harus ${kinds.map((k) => k.split('/')[1].toUpperCase()).join('/')}`);
  return mime;
}

async function addDoc(env, p, { jenis, penanda = null, name, mime, bytes, aktor, status = 'aktif', halaman }) {
  const v = await env.DB.prepare('SELECT COALESCE(MAX(versi),0) + 1 AS v FROM pks_dokumen WHERE perjanjian_id = ? AND jenis = ?').bind(p.id, jenis).first();
  const sha = await sha256Hex(bytes);
  if (halaman === undefined && mime === 'application/pdf') halaman = await pageCount(bytes);
  const st = await putFile(env, { mitraNama: p.mitra.nama, kode: p.kode, jenis, name, mime, bytes });
  const doc = { id: uid('doc_'), perjanjian_id: p.id, jenis, versi: v.v, penanda, nama: name, mime, ukuran: bytes.length, halaman: halaman ?? null, sha256: sha, ...st, status, pengunggah: aktor, dibuat_pada: now() };
  await env.DB.prepare('INSERT INTO pks_dokumen (id, perjanjian_id, jenis, versi, penanda, nama, mime, ukuran, halaman, sha256, storage, storage_id, status, pengunggah, dibuat_pada) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(doc.id, doc.perjanjian_id, doc.jenis, doc.versi, doc.penanda, doc.nama, doc.mime, doc.ukuran, doc.halaman, doc.sha256, doc.storage, doc.storage_id, doc.status, doc.pengunggah, doc.dibuat_pada).run();
  await audit(env, aktor, p.id, 'dokumen_diunggah', { dokumen: doc.id, jenis, versi: doc.versi, penanda, sha256: sha });
  return doc;
}

export async function latestDoc(env, pid, jenis, status = 'aktif') {
  return env.DB.prepare('SELECT * FROM pks_dokumen WHERE perjanjian_id = ? AND jenis = ? AND status = ? ORDER BY versi DESC LIMIT 1').bind(pid, jenis, status).first();
}

/** Baca berkas dan verifikasi integritas; bila hash beda, tandai "tidak_sesuai". */
export async function readDoc(env, doc) {
  const bytes = await getFile(env, doc);
  if ((await sha256Hex(bytes)) !== doc.sha256) {
    await env.DB.prepare("UPDATE pks_dokumen SET status = 'tidak_sesuai' WHERE id = ?").bind(doc.id).run();
    await audit(env, 'sistem', doc.perjanjian_id, 'dokumen_tidak_sesuai', { dokumen: doc.id });
    fail(409, 'Berkas di penyimpanan berubah di luar Starlite dan ditandai tidak sesuai');
  }
  return bytes;
}

async function issueToken(env, pid, tujuan) {
  const cfg = await konfig(env);
  const raw = randomToken();
  const exp = new Date(Date.now() + cfg.tokenHari * 86400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE pks_token SET dicabut = 1 WHERE perjanjian_id = ?').bind(pid),
    env.DB.prepare('INSERT INTO pks_token (token_hash, perjanjian_id, tujuan, kedaluwarsa, dibuat_pada) VALUES (?,?,?,?,?)').bind(await sha256Hex(raw), pid, tujuan, exp, now()),
  ]);
  return raw;
}
const portalUrl = (env, raw) => `${env.APP_URL}/portal.html#t=${raw}`;

export async function resolveToken(env, raw) {
  if (!raw || raw.length < 20) fail(401, 'Tautan tidak valid');
  const t = await env.DB.prepare('SELECT * FROM pks_token WHERE token_hash = ?').bind(await sha256Hex(raw)).first();
  if (!t || t.dicabut) fail(401, 'Tautan sudah tidak berlaku. Gunakan tautan terbaru dari email kami.');
  if (t.kedaluwarsa < now()) fail(401, 'Tautan kedaluwarsa. Hubungi Vendor Management untuk tautan baru.');
  return { token: t, p: await loadP(env, t.perjanjian_id) };
}

async function refreshSnapshot(env, p) {
  const m = await getMitra(env, p.mitra_row);
  if (!m.emails.length) fail(422, `Email ${m.nama} kosong di info perseroan. Lengkapi dulu di Cloudflare (tabel mitra).`);
  p.mitra = snapshot(m);
  await env.DB.prepare('UPDATE pks_perjanjian SET snapshot_mitra = ? WHERE id = ?').bind(JSON.stringify(p.mitra), p.id).run();
  return p.mitra;
}

async function bytesOf(file) { return new Uint8Array(await file.arrayBuffer()); }

// ---------------- Tahap 0: buat ----------------
export async function create(env, user, form) {
  const mitraRow = Number(form.get('mitra_row'));
  const jenis = String(form.get('jenis') || 'PKS');
  const judul = String(form.get('judul') || '').trim();
  if (!mitraRow) fail(400, 'Pilih mitra');
  if (judul.length < 3) fail(400, 'Judul perjanjian wajib diisi');
  const j = await env.DB.prepare('SELECT * FROM pks_jenis WHERE kode = ?').bind(jenis).first();
  if (!j) fail(400, 'Jenis perjanjian tidak dikenal');
  const file = form.get('master');
  checkFile(file, ['application/pdf']);
  const m = await getMitra(env, mitraRow);
  const t = now();
  const seq = await env.DB.prepare("SELECT COUNT(*) + 1 AS n FROM pks_perjanjian WHERE substr(dibuat_pada,1,4) = ?").bind(t.slice(0, 4)).first();
  const kode = `${jenis}-${t.slice(0, 4)}-${String(seq.n).padStart(4, '0')}`;
  const p = { id: uid('pks_'), kode, mitra_row: mitraRow, mitra: snapshot(m), jenis, judul, pic_vm: user.email };
  await env.DB.prepare('INSERT INTO pks_perjanjian (id, kode, mitra_row, snapshot_mitra, jenis, judul, tahap, status, pic_vm, dibuat_pada, diperbarui_pada) VALUES (?,?,?,?,?,?,0,?,?,?,?)')
    .bind(p.id, kode, mitraRow, JSON.stringify(p.mitra), jenis, judul, 'draf', user.email, t, t).run();
  await env.DB.prepare('INSERT INTO pks_tahap (perjanjian_id, tahap, mulai, pic) VALUES (?,0,?,?)').bind(p.id, t, 'vm').run();
  await audit(env, user.email, p.id, 'perjanjian_dibuat', { kode, mitra_row: mitraRow, jenis });
  await addDoc(env, p, { jenis: 'master', name: `${kode} Master.pdf`, mime: 'application/pdf', bytes: await bytesOf(file), aktor: user.email });
  return p.id;
}

// ---------------- Tahap 1: kirim ----------------
export async function kirim(env, user, id) {
  const p = await loadP(env, id);
  need(p, 0);
  const m = await refreshSnapshot(env, p);
  const master = await latestDoc(env, id, 'master');
  const bytes = await readDoc(env, master);
  const tenggat = addWorkdays(now(), (await konfig(env)).sla['1'] || 5);
  const raw = await issueToken(env, id, 'feedback');
  const tpl = templates.kirim({ p, m, tenggat, url: portalUrl(env, raw) });
  const res = await sendMail(env, { perjanjianId: id, tipe: 'kirim', to: m.emails, ...tpl, attachments: [{ name: master.nama, mime: 'application/pdf', bytes }] });
  await env.DB.prepare('UPDATE pks_perjanjian SET gmail_thread_id = ?, gmail_last_check = ? WHERE id = ?').bind(res.threadId, now(), id).run();
  await setTahap(env, p, 1, user.email);
  await audit(env, user.email, id, 'dikirim_ke_mitra', { penerima: m.emails, mode: res.mode });
  return { mode: res.mode, portal: env.APP_ENV === 'dev' ? portalUrl(env, raw) : undefined };
}

// ---------------- Tahap 2: feedback ----------------
async function putaran(env, id) {
  return (await env.DB.prepare('SELECT COUNT(*) + 1 AS n FROM pks_feedback WHERE perjanjian_id = ?').bind(id).first()).n;
}
export async function addFeedback(env, p, { sumber, pengirim, isi, setuju, extId = null, at = now() }, aktor) {
  need(p, 1, 2);
  isi = String(isi || '').trim();
  if (!setuju && isi.length < 3) fail(400, 'Isi tanggapan wajib diisi');
  const fid = uid('fb_');
  await env.DB.prepare('INSERT INTO pks_feedback (id, perjanjian_id, putaran, sumber, pengirim, isi, setuju, ext_id, diterima_pada) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(fid, p.id, await putaran(env, p.id), sumber, pengirim || null, isi || 'Setuju tanpa catatan', setuju ? 1 : 0, extId, at).run();
  await audit(env, aktor, p.id, 'feedback_diterima', { sumber, setuju: !!setuju });
  if (p.tahap === 1) await setTahap(env, p, 2, aktor, setuju ? 'Mitra setuju tanpa catatan' : 'Feedback diterima');
  return fid;
}

// ---------------- Tahap 3: ke Legal ----------------
export async function keLegal(env, user, id) {
  const p = await loadP(env, id);
  need(p, 1, 2);
  const tenggat = await setTahap(env, p, 3, user.email);
  const legal = (await env.DB.prepare("SELECT email FROM pks_pengguna WHERE peran = 'legal' AND aktif = 1").all()).results.map((r) => r.email);
  if (legal.length) {
    await sendMail(env, { perjanjianId: id, tipe: 'legal', to: legal, ...templates.legal({ p, m: p.mitra, tenggat, appUrl: env.APP_URL }) }).catch(() => {});
  }
  await audit(env, user.email, id, 'diserahkan_ke_legal', { legal });
}

// ---------------- Tahap 4: nomor surat ----------------
export async function terbitNomor(env, user, id, form) {
  const p = await loadP(env, id);
  need(p, 3);
  const nomor = String(form.get('nomor_surat') || '').trim();
  const cfg = await konfig(env);
  if (!cfg.formatNomor.test(nomor)) fail(400, 'Format nomor surat tidak sesuai ketentuan Legal');
  const dup = await env.DB.prepare('SELECT kode FROM pks_perjanjian WHERE nomor_surat = ? AND id != ?').bind(nomor, id).first();
  if (dup) fail(409, `Nomor surat sudah dipakai perjanjian ${dup.kode}`);
  const file = form.get('dokumen');
  checkFile(file, ['application/pdf']);
  const bytes = await bytesOf(file);
  const master = await latestDoc(env, id, 'master');
  const hal = await pageCount(bytes);
  if (master?.halaman && hal !== master.halaman) fail(422, `Jumlah halaman (${hal}) berbeda dengan dokumen master (${master.halaman})`);
  await env.DB.prepare('UPDATE pks_perjanjian SET nomor_surat = ?, diperbarui_pada = ? WHERE id = ?').bind(nomor, now(), id).run();
  p.nomor_surat = nomor;
  await addDoc(env, p, { jenis: 'bernomor', name: `${p.kode} Bernomor.pdf`, mime: 'application/pdf', bytes, aktor: user.email, halaman: hal });
  await setTahap(env, p, 4, user.email, `Nomor ${nomor}`);
  await audit(env, user.email, id, 'nomor_terbit', { nomor_surat: nomor });
  const pic = await env.DB.prepare('SELECT email FROM pks_pengguna WHERE email = ?').bind(p.pic_vm).first();
  if (pic) await sendMail(env, { perjanjianId: id, tipe: 'nomor', to: [pic.email], ...templates.nomor({ p, m: p.mitra, appUrl: env.APP_URL }) }).catch(() => {});
}

// ---------------- Tahap 5: bagikan ----------------
export async function bagikan(env, user, id) {
  const p = await loadP(env, id);
  need(p, 4);
  const m = await refreshSnapshot(env, p);
  const doc = await latestDoc(env, id, 'bernomor');
  const bytes = await readDoc(env, doc);
  const tenggat = addWorkdays(now(), (await konfig(env)).sla['5'] || 5);
  const raw = await issueToken(env, id, 'ttd');
  const tpl = templates.bagikan({ p, m, tenggat, url: portalUrl(env, raw) });
  const res = await sendMail(env, { perjanjianId: id, tipe: 'bagikan', to: m.emails, ...tpl, attachments: [{ name: `Perjanjian ${p.nomor_surat}.pdf`.replace(/[\\/]/g, '-'), mime: 'application/pdf', bytes }], threadId: p.gmail_thread_id });
  await setTahap(env, p, 5, user.email);
  await audit(env, user.email, id, 'dibagikan_ke_mitra', { mode: res.mode });
  return { mode: res.mode, portal: env.APP_ENV === 'dev' ? portalUrl(env, raw) : undefined };
}

// ---------------- Tahap 6 & 7: tanda tangan ----------------
async function posisi(env, p, pihak) {
  const j = await env.DB.prepare('SELECT posisi_ttd, masa_bulan FROM pks_jenis WHERE kode = ?').bind(p.jenis).first();
  return { pos: JSON.parse(j.posisi_ttd)[pihak], masa: j.masa_bulan };
}
async function sumberTtd(env, p, pihak) {
  const doc = pihak === 'mitra' ? await latestDoc(env, p.id, 'bernomor') : await latestDoc(env, p.id, 'ttd_mitra');
  if (!doc) fail(409, 'Dokumen sumber tanda tangan belum tersedia');
  return doc;
}

/** Opsi 1: tempel gambar TTD. Mengembalikan bytes PDF (untuk pratinjau atau disimpan). */
export async function tempelTtd(env, p, pihak, file) {
  const mime = checkFile(file, ['image/png', 'image/jpeg']);
  const src = await sumberTtd(env, p, pihak);
  const { pos } = await posisi(env, p, pihak);
  return { bytes: await stampSignature(await readDoc(env, src), await bytesOf(file), mime, pos), halaman: src.halaman };
}

export async function unggahTtdMitra(env, p, opsi, file, aktor, olehVm) {
  need(p, 5);
  let bytes, penanda, halaman;
  if (opsi === '1') {
    ({ bytes, halaman } = await tempelTtd(env, p, 'mitra', file));
    penanda = 'hasil_tempel';
  } else if (opsi === '2') {
    checkFile(file, ['application/pdf']);
    bytes = await bytesOf(file);
    halaman = await pageCount(bytes);
    const ref = await latestDoc(env, p.id, 'bernomor');
    if (ref?.halaman && halaman !== ref.halaman) fail(422, `Jumlah halaman scan (${halaman}) berbeda dengan dokumen bernomor (${ref.halaman}). Pastikan semua halaman ikut dipindai.`);
    penanda = 'scan_asli';
  } else fail(400, 'Pilih opsi tanda tangan');
  await env.DB.prepare("UPDATE pks_dokumen SET status = 'ditolak' WHERE perjanjian_id = ? AND jenis = 'ttd_mitra' AND status = 'menunggu_review'").bind(p.id).run();
  const doc = await addDoc(env, p, { jenis: 'ttd_mitra', penanda, name: `${p.kode} TTD Mitra.pdf`, mime: 'application/pdf', bytes, aktor, halaman, status: olehVm ? 'aktif' : 'menunggu_review' });
  if (olehVm) await setTahap(env, p, 6, aktor, 'TTD mitra diunggah VM');
  return doc.id;
}

export async function reviewTtdMitra(env, user, id, { setuju, alasan }) {
  const p = await loadP(env, id);
  need(p, 5);
  const doc = await latestDoc(env, id, 'ttd_mitra', 'menunggu_review');
  if (!doc) fail(409, 'Belum ada unggahan TTD mitra untuk diperiksa');
  if (setuju) {
    await env.DB.prepare("UPDATE pks_dokumen SET status = 'aktif' WHERE id = ?").bind(doc.id).run();
    await setTahap(env, p, 6, user.email, 'TTD mitra disetujui');
    await audit(env, user.email, id, 'ttd_mitra_disetujui', { dokumen: doc.id });
  } else {
    if (!alasan || alasan.trim().length < 5) fail(400, 'Tuliskan alasan penolakan agar mitra dapat memperbaiki');
    await env.DB.prepare("UPDATE pks_dokumen SET status = 'ditolak' WHERE id = ?").bind(doc.id).run();
    const raw = await issueToken(env, id, 'ttd');
    await sendMail(env, { perjanjianId: id, tipe: 'ttd_ditolak', to: p.mitra.emails, ...templates.ttd_ditolak({ p, m: p.mitra, alasan, url: portalUrl(env, raw) }), threadId: p.gmail_thread_id });
    await audit(env, user.email, id, 'ttd_mitra_ditolak', { dokumen: doc.id, alasan });
    return { portal: env.APP_ENV === 'dev' ? portalUrl(env, raw) : undefined };
  }
}

export async function ttdIje(env, user, id, form) {
  if (!user.penandatangan && user.peran !== 'admin') fail(403, 'Hanya penandatangan berwenang PT IJE yang dapat mengunggah TTD');
  const p = await loadP(env, id);
  need(p, 6);
  const opsi = String(form.get('opsi'));
  const file = form.get('berkas');
  let bytes, penanda, halaman;
  if (opsi === '1') { ({ bytes, halaman } = await tempelTtd(env, p, 'ije', file)); penanda = 'hasil_tempel'; }
  else if (opsi === '2') {
    checkFile(file, ['application/pdf']);
    bytes = await bytesOf(file);
    halaman = await pageCount(bytes);
    const ref = await latestDoc(env, id, 'bernomor');
    if (ref?.halaman && halaman !== ref.halaman) fail(422, `Jumlah halaman scan (${halaman}) berbeda dengan dokumen bernomor (${ref.halaman})`);
    penanda = 'scan_asli';
  } else fail(400, 'Pilih opsi tanda tangan');
  const efektif = String(form.get('tgl_efektif') || '').trim() || new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(efektif)) fail(400, 'Tanggal efektif tidak valid');
  const { masa } = await posisi(env, p, 'ije');
  const bulan = Number(form.get('masa_bulan') || masa);
  const berakhir = addMonths(efektif, bulan);
  const doc = await addDoc(env, p, { jenis: 'final', penanda, name: `${p.kode} Final ${p.nomor_surat}.pdf`.replace(/[\\/]/g, '-'), mime: 'application/pdf', bytes, aktor: user.email, halaman });
  await env.DB.prepare('UPDATE pks_perjanjian SET tgl_efektif = ?, tgl_berakhir = ? WHERE id = ?').bind(efektif, berakhir, id).run();
  Object.assign(p, { tgl_efektif: efektif, tgl_berakhir: berakhir });
  await setTahap(env, p, 7, user.email, 'Ditandatangani kedua pihak');
  await env.DB.prepare('UPDATE pks_token SET dicabut = 1 WHERE perjanjian_id = ?').bind(id).run();
  await audit(env, user.email, id, 'perjanjian_selesai', { dokumen: doc.id, tgl_efektif: efektif, tgl_berakhir: berakhir });
  await sendMail(env, { perjanjianId: id, tipe: 'final', to: p.mitra.emails, ...templates.final({ p, m: p.mitra }), attachments: [{ name: doc.nama, mime: 'application/pdf', bytes }], threadId: p.gmail_thread_id })
    .catch((e) => audit(env, 'sistem', id, 'email_final_gagal', { galat: e.message }));
  return doc.id;
}

// ---------------- Koreksi alur ----------------
export async function mundur(env, user, id, { ke, alasan }) {
  const p = await loadP(env, id);
  ke = Number(ke);
  if (p.status === 'batal' || p.tahap === 7) fail(409, 'Perjanjian sudah final atau dibatalkan');
  if (!(ke >= 0 && ke < p.tahap)) fail(400, 'Tahap tujuan harus sebelum tahap saat ini');
  if (!alasan || alasan.trim().length < 5) fail(400, 'Alasan pengembalian wajib diisi');
  await env.DB.prepare('UPDATE pks_token SET dicabut = 1 WHERE perjanjian_id = ?').bind(id).run();
  await setTahap(env, p, ke, user.email, `Dikembalikan: ${alasan}`);
  await audit(env, user.email, id, 'tahap_dikembalikan', { ke, alasan });
}

export async function batal(env, user, id, { alasan }) {
  const p = await loadP(env, id);
  if (p.tahap === 7) fail(409, 'Perjanjian yang sudah selesai tidak dapat dibatalkan');
  if (!alasan || alasan.trim().length < 5) fail(400, 'Alasan pembatalan wajib diisi');
  const t = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE pks_perjanjian SET status = 'batal', alasan_batal = ?, tenggat = NULL, diperbarui_pada = ? WHERE id = ?").bind(alasan, t, id),
    env.DB.prepare('UPDATE pks_tahap SET selesai = ? WHERE perjanjian_id = ? AND selesai IS NULL').bind(t, id),
    env.DB.prepare('UPDATE pks_token SET dicabut = 1 WHERE perjanjian_id = ?').bind(id),
  ]);
  await audit(env, user.email, id, 'perjanjian_dibatalkan', { alasan });
}

export function statusTampil(p) {
  if (p.status === 'batal') return 'batal';
  if (p.tahap === 0) return 'draf';
  if (p.tahap < 7) return p.tenggat && p.tenggat < now() ? 'terlambat' : 'berjalan';
  if (!p.tgl_berakhir) return 'aktif';
  const hari = (new Date(p.tgl_berakhir + 'T23:59:59+07:00') - Date.now()) / 86400_000;
  return hari < 0 ? 'berakhir' : hari <= 90 ? 'akan_berakhir' : 'aktif';
}
