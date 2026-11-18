// Pengiriman email (Gmail API akun VM) + templat. Tanpa kredensial di mode dev: dicatat sebagai "simulasi".
import { googleEnabled, gmailSend } from './google.js';
import { uid, now, escapeHtml as e } from './util.js';

const fmtTgl = (iso) => iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }) : '-';

function layout(inner, cta) {
  return `<!doctype html><html><body style="margin:0;background:#F3F5F8;font-family:Arial,Helvetica,sans-serif;color:#1d2a3a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;border:1px solid #E3E8EF">
<tr><td style="padding:22px 28px 6px;font-size:18px;font-weight:bold;color:#0B3B75">Starlite</td></tr>
<tr><td style="padding:6px 28px 8px;font-size:14px;line-height:1.6">${inner}</td></tr>
${cta ? `<tr><td style="padding:8px 28px 22px"><a href="${e(cta.url)}" style="display:inline-block;background:#2F9BEF;color:#fff;text-decoration:none;padding:11px 20px;border-radius:999px;font-weight:bold;font-size:14px">${e(cta.label)}</a></td></tr>` : ''}
<tr><td style="padding:14px 28px 22px;font-size:12px;color:#6b7a8c;border-top:1px solid #E3E8EF">Vendor Management — PT Integrasi Jaringan Ekosistem<br>Email ini dikirim otomatis oleh Starlite. Balasan atas email ini tercatat pada perjanjian terkait.</td></tr>
</table></td></tr></table></body></html>`;
}

export const templates = {
  kirim: ({ p, m, tenggat, url }) => ({
    subject: `Perjanjian Kerja Sama ${m.nama} — ${p.kode}`,
    html: layout(`<p>Yth. Direksi ${e(m.nama)},</p>
<p>Bersama ini kami sampaikan dokumen <b>${e(p.judul)}</b> untuk ditinjau. Mohon tanggapan paling lambat <b>${fmtTgl(tenggat)}</b>.</p>
<p>Tanggapan dapat disampaikan dengan membalas email ini atau melalui tautan di bawah. Bila tidak ada catatan, pilih "Setuju tanpa catatan".</p>`, { url, label: 'Tinjau dokumen' }),
  }),
  legal: ({ p, m, tenggat, appUrl }) => ({
    subject: `[Starlite] Mohon nomor surat — ${p.kode} ${m.nama}`,
    html: layout(`<p>Perjanjian <b>${e(p.judul)}</b> dengan <b>${e(m.nama)}</b> telah disetujui mitra dan menunggu penerbitan nomor surat.</p><p>Tenggat: <b>${fmtTgl(tenggat)}</b>.</p>`, { url: `${appUrl}/#/perjanjian/${p.id}`, label: 'Buka perjanjian' }),
  }),
  nomor: ({ p, m, appUrl }) => ({
    subject: `[Starlite] Nomor surat terbit — ${p.nomor_surat}`,
    html: layout(`<p>Legal telah menerbitkan nomor <b>${e(p.nomor_surat)}</b> untuk perjanjian dengan <b>${e(m.nama)}</b>. Silakan bagikan kembali ke mitra.</p>`, { url: `${appUrl}/#/perjanjian/${p.id}`, label: 'Bagikan ke mitra' }),
  }),
  bagikan: ({ p, m, tenggat, url }) => ({
    subject: `Penandatanganan Perjanjian No. ${p.nomor_surat} — ${m.nama}`,
    html: layout(`<p>Yth. Direksi ${e(m.nama)},</p>
<p>Terlampir perjanjian <b>No. ${e(p.nomor_surat)}</b>. Mohon ditandatangani, dibubuhi stempel perusahaan dan meterai, lalu diunggah paling lambat <b>${fmtTgl(tenggat)}</b> dengan salah satu cara:</p>
<ol style="padding-left:18px"><li>Unggah scan tanda tangan beserta stempel dan meterai; sistem menempelkannya pada dokumen.</li><li>Unggah scan dokumen lengkap yang sudah ditandatangani.</li></ol>`, { url, label: 'Unggah tanda tangan' }),
  }),
  ttd_ditolak: ({ p, m, alasan, url }) => ({
    subject: `Mohon unggah ulang tanda tangan — ${p.nomor_surat || p.kode}`,
    html: layout(`<p>Yth. Direksi ${e(m.nama)},</p><p>Dokumen tanda tangan yang diunggah belum dapat kami terima dengan catatan:</p><p style="background:#FCE8E8;padding:10px 12px;border-radius:8px">${e(alasan)}</p><p>Mohon diunggah ulang melalui tautan berikut.</p>`, { url, label: 'Unggah ulang' }),
  }),
  final: ({ p, m }) => ({
    subject: `Salinan Final Perjanjian No. ${p.nomor_surat} — ${m.nama}`,
    html: layout(`<p>Yth. Direksi ${e(m.nama)},</p><p>Perjanjian <b>No. ${e(p.nomor_surat)}</b> telah ditandatangani kedua pihak. Salinan final terlampir untuk arsip Bapak/Ibu.</p><p>Masa berlaku: ${fmtTgl(p.tgl_efektif)} s.d. ${fmtTgl(p.tgl_berakhir)}.</p><p>Terima kasih atas kerja samanya.</p>`),
  }),
  pengingat_mitra: ({ p, m, tenggat, url, telat }) => ({
    subject: `${telat ? 'Lewat tenggat' : 'Pengingat'}: Perjanjian ${p.nomor_surat || p.kode} — ${m.nama}`,
    html: layout(`<p>Yth. Direksi ${e(m.nama)},</p><p>${telat ? 'Tenggat' : 'Mengingatkan tenggat'} tindak lanjut perjanjian <b>${e(p.judul)}</b> ${telat ? 'telah lewat pada' : 'jatuh pada'} <b>${fmtTgl(tenggat)}</b>. Mohon segera ditindaklanjuti.</p>`, url ? { url, label: 'Buka dokumen' } : null),
  }),
  pengingat_internal: ({ p, m, tahapNama, tenggat, telat, appUrl }) => ({
    subject: `[Starlite] ${telat ? 'Terlambat' : 'Tenggat dekat'} — ${p.kode} ${m.nama}`,
    html: layout(`<p>Tahap <b>${e(tahapNama)}</b> untuk perjanjian dengan <b>${e(m.nama)}</b> ${telat ? 'melewati' : 'mendekati'} tenggat ${fmtTgl(tenggat)}.</p>`, { url: `${appUrl}/#/perjanjian/${p.id}`, label: 'Buka perjanjian' }),
  }),
  berakhir: ({ p, m, hari, appUrl }) => ({
    subject: `[Starlite] Perjanjian berakhir ${hari} hari lagi — ${p.nomor_surat}`,
    html: layout(`<p>Perjanjian <b>No. ${e(p.nomor_surat)}</b> dengan <b>${e(m.nama)}</b> berakhir pada <b>${fmtTgl(p.tgl_berakhir)}</b>. Pertimbangkan perpanjangan atau addendum.</p>`, { url: `${appUrl}/#/perjanjian/${p.id}`, label: 'Buka perjanjian' }),
  }),
};

/** Kirim email + catat log. Mengembalikan {threadId, messageId, mode}. */
export async function sendMail(env, { perjanjianId, tipe, to, cc = [], subject, html, attachments = [], threadId }) {
  const id = uid('mail_');
  const mode = googleEnabled(env) ? 'gmail' : 'simulasi';
  if (!to.length) throw new Error('Alamat email tujuan kosong');
  if (mode === 'simulasi' && env.APP_ENV !== 'dev') throw new Error('Kredensial Gmail belum dipasang');
  try {
    let res = { threadId: threadId || `sim_${id}`, id: `sim_${id}` };
    if (mode === 'gmail') res = await gmailSend(env, { from: env.MAIL_FROM, to, cc, subject, html, attachments }, threadId);
    await env.DB.prepare('INSERT INTO pks_email_log (id, perjanjian_id, tipe, penerima, subjek, mode, status, thread_id, message_id, waktu) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(id, perjanjianId, tipe, [...to, ...cc].join(', '), subject, mode, 'terkirim', res.threadId, res.id, now()).run();
    return { threadId: res.threadId, messageId: res.id, mode };
  } catch (err) {
    await env.DB.prepare('INSERT INTO pks_email_log (id, perjanjian_id, tipe, penerima, subjek, mode, status, galat, waktu) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(id, perjanjianId, tipe, [...to, ...cc].join(', '), subject, mode, 'gagal', String(err.message).slice(0, 500), now()).run();
    throw err;
  }
}
