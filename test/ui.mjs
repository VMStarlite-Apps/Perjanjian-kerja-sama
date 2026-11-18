// Uji UI nyata dengan Chrome (puppeteer-core) terhadap wrangler dev lokal.
import puppeteer from 'puppeteer-core';
import { resolve } from 'node:path';

const BASE = 'http://127.0.0.1:8787';
const NOMOR = `${String(Date.now() % 900 + 100)}/PKS/IJE/XI/2026`;
let pass = 0, failN = 0;
const ok = (c, n, x = '') => { if (c) { pass++; console.log('  ✓', n); } else { failN++; console.log('  ✗', n, x); } };
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|net::|status of 401/.test(m.text())) errors.push(m.text()); });
const waitText = (t, timeout = 15000) => page.waitForFunction((t) => document.body.innerText.includes(t), { timeout, polling: 250 }, t);
const clickText = async (sel, text) => {
  await page.waitForFunction((s, t) => [...document.querySelectorAll(s)].some((e) => e.innerText.trim().includes(t)), { timeout: 15000, polling: 250 }, sel, text);
  await page.evaluate((s, t) => [...document.querySelectorAll(s)].find((e) => e.innerText.trim().includes(t)).click(), sel, text);
};

console.log('Starlite — uji antarmuka\n');
console.log('Masuk');
await page.goto(BASE + '/#/perjanjian', { waitUntil: 'networkidle0' });
ok(await page.$('[data-login]'), 'tanpa sesi: halaman masuk tampil, tanpa menu');
ok(await page.$eval('.side', (e) => e.hidden), 'menu samping tersembunyi sebelum masuk');
await page.type('#l-email', 'vendormanagement@pmosurge.co.id');
await page.type('#l-pw', 'salah-banget-12');
await page.click('[data-login] button');
await page.waitForFunction(() => document.querySelector('[data-err]')?.textContent.includes('Email atau password salah'), { timeout: 10000 });
ok(true, 'password salah menampilkan pesan galat');
await page.$eval('#l-pw', (e) => { e.value = ''; });
await page.type('#l-pw', 'Uji-Starlite-2026');
await page.click('[data-login] button');
await page.waitForSelector('[data-keluar]', { timeout: 15000 });
ok(!(await page.$eval('.side', (e) => e.hidden)), 'login benar: aplikasi terbuka');
ok(await page.$('[data-keluar]'), 'tombol Keluar tersedia');

await page.waitForFunction(() => document.querySelector('table.t, .empty'), { timeout: 15000 });
ok(true, 'daftar perjanjian tampil');

console.log('\nBuat perjanjian lewat form');
await clickText('button', 'Perjanjian baru');
await page.waitForSelector('dialog .picker button');
await page.type('#m-q', 'DESNARUM');
await page.waitForFunction(() => [...document.querySelectorAll('.picker button')].some((b) => b.innerText.includes('DESNARUM')), { timeout: 8000 });
await clickText('.picker button', 'DESNARUM');
const sel = await page.$eval('[data-sel]', (e) => e.innerText);
ok(sel.includes('desnarum.jayaakasha@gmail.com'), 'memilih mitra menampilkan email tujuan');
ok((await page.$eval('#m-judul', (e) => e.value)).includes('DESNARUM'), 'judul terisi otomatis');
ok(!(await page.$('#m-file')) && (await page.$$('[data-isi]')).length === 9, 'form memakai 9 isian kuning template, tanpa unggah dokumen');
ok((await page.$eval('[data-isi="nama"]', (e) => e.value)).includes('DESNARUM'), 'isian nama perusahaan terisi dari info perseroan');
await page.$eval('[data-isi="tanggal"]', (e) => { e.value = '2026-11-18'; e.dispatchEvent(new Event('input', { bubbles: true })); });
for (const [k, v] of Object.entries({ domisili: 'Jakarta Barat', jabatan: 'Direktur', wakil: 'Budi Santoso', alamat: 'Jl. Uji No. 1, Jakarta', telp: '021 5551234', email: 'uji@desnarum.example', up: 'Siti - Legal' })) {
  const el = await page.$(`[data-isi="${k}"]`);
  if (!(await el.evaluate((e) => e.value))) await el.type(v);
}
await clickText('dialog button', 'Buat perjanjian');
await page.waitForFunction(() => location.hash.startsWith('#/perjanjian/pks_'), { timeout: 15000 });
await waitText('Kirim dokumen ke mitra');
ok(true, 'perjanjian dibuat dan halaman detail terbuka');
ok(await page.$eval('#app', (e) => e.classList.contains('masuk') && !e.classList.contains('memuat')), 'perpindahan layar selesai dengan animasi masuk');
ok((await page.$$eval('.docs li', (l) => l.length)) === 1 && (await page.$eval('.docs', (e) => e.innerText)).includes('29 halaman'), 'dokumen master 29 halaman dibuat dari template');
const detailUrl = page.url();

await clickText('button', 'Ubah isian dokumen');
await page.waitForSelector('dialog [data-isi="jabatan"]');
ok((await page.$eval('dialog [data-isi="jabatan"]', (e) => e.value)) === 'Direktur', 'dialog ubah isian memuat nilai terkini');
await page.$eval('dialog [data-isi="jabatan"]', (e) => { e.value = ''; });
await page.type('dialog [data-isi="jabatan"]', 'Direktur Utama');
await clickText('dialog button', 'Simpan isian');
await page.waitForFunction(() => document.querySelectorAll('.docs li').length === 2, { timeout: 10000 });
ok(true, 'isian kuning diubah lewat aplikasi: dokumen master versi 2 tampil');

console.log('\nKirim, tanggapan, Legal, bagikan (melalui tombol UI)');
await clickText('button', 'Kirim ke mitra');
await waitText('Menunggu persetujuan mitra');
ok(true, 'tombol Kirim ke mitra memindahkan ke tahap 1');
await page.evaluate(() => document.querySelector('details.more summary').click());
await page.type('#fb-isi', 'Mitra setuju lewat telepon');
await page.click('#fb-setuju');
await clickText('button', 'Catat tanggapan');
await waitText('Terbitkan nomor surat');
ok(true, 'persetujuan mitra dicatat: otomatis diteruskan ke Legal');
await page.type('#no', NOMOR);
const pid = detailUrl.split('/').pop();
const portalP = page.waitForResponse((r) => r.url().endsWith(`/api/perjanjian/${pid}/nomor`));
await clickText('button', 'Terbitkan nomor');
const portal = (await (await portalP).json()).portal;
await waitText('Menunggu tanda tangan mitra');
ok(portal && portal.includes('#t='), 'nomor terbit lewat UI dan langsung dikirim ke mitra untuk TTD');

console.log('\nPortal mitra: TTD opsi 1 (bersihkan latar, pratinjau, kirim)');
const mp = await browser.newPage();
await mp.setViewport({ width: 1100, height: 1000 });
mp.on('pageerror', (e) => errors.push('portal: ' + e.message));
await mp.goto(portal, { waitUntil: 'networkidle0' });
ok(!(await mp.evaluate(() => location.hash.includes('t='))), 'token dihapus dari bilah alamat');
await mp.waitForFunction(() => document.body.innerText.includes('Tanda tangani perjanjian'));
ok(await mp.$eval('.ttd-stage', (e) => e.hidden), 'area pratinjau tersembunyi sebelum file dipilih');
await (await mp.$('#ttd-file')).uploadFile(resolve('test/fixtures/ttd-scan.jpg'));
await mp.waitForFunction(() => !document.querySelector('.ttd-stage').hidden && document.querySelector('.ttd-stage canvas').width > 10);
const alpha = await mp.evaluate(() => { const c = document.querySelector('.ttd-stage canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let t = 0; for (let i = 3; i < d.length; i += 4) if (d[i] === 0) t++; return { ratio: t / (d.length / 4), w: c.width, h: c.height }; });
ok(alpha.ratio > 0.3, `latar kertas dihapus (${Math.round(alpha.ratio * 100)}% piksel transparan), dipotong ke ${alpha.w}x${alpha.h}`);
await mp.screenshot({ path: 'test/out/portal-ttd.png' });
await mp.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.includes('Lihat pratinjau')).click());
await mp.waitForFunction(() => !document.querySelector('iframe.pdf-frame').hidden && !document.querySelector('[data-act="confirm"]').disabled, { timeout: 15000 });
ok(true, 'pratinjau PDF bertanda tangan dimuat, tombol kirim aktif');
await mp.evaluate(() => document.querySelector('[data-act="confirm"]').click());
await mp.waitForFunction(() => document.body.innerText.includes('Tanda tangan diterima'), { timeout: 15000 });
ok(true, 'mitra mengirim tanda tangan');

console.log('\nVM memeriksa, PT IJE menyelesaikan (opsi 2)');
await page.bringToFront();
await page.reload({ waitUntil: 'networkidle0' });
await waitText('Periksa tanda tangan mitra');
ok(true, 'VM melihat permintaan pemeriksaan');
await clickText('button', 'Setujui tanda tangan');
await waitText('Tanda tangan PT IJE');
ok(true, 'TTD mitra disetujui, lanjut ke tahap PT IJE');
await clickText('.seg-toggle button', 'Opsi 2');
await (await page.$('#full')).uploadFile(resolve('test/fixtures/29hal.pdf'));
await clickText('button', 'Unggah dan selesaikan');
await waitText('Perjanjian ditandatangani kedua pihak');
ok(true, 'perjanjian selesai lewat UI');
ok((await page.$$eval('.timeline li.done', (l) => l.length)) === 5, 'linimasa menandai seluruh 5 langkah selesai');
await page.screenshot({ path: 'test/out/detail-selesai.png', fullPage: false });

console.log('\nNavigasi lain');
await page.goto(BASE + '/#/mitra', { waitUntil: 'networkidle0' });
await clickText('table.t tbody tr td', 'DESNARUM');
await page.waitForSelector('dialog[open]');
ok((await page.$eval('dialog[open]', (d) => d.innerText))
  .includes(NOMOR), 'detail mitra memuat riwayat perjanjian');
await page.keyboard.press('Escape');
await page.goto(BASE + '/#/perjanjian', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => document.querySelector('#app.masuk .tabs') && document.querySelectorAll('.tabs button').length > 5, { timeout: 10000 });
ok(!(await page.$('.kanban')) && (await page.$$eval('.tabs button', (b) => b.map((x) => x.innerText))).join('|') === 'Semua|Draf|Review mitra|Nomor surat|TTD mitra|TTD PT IJE|Selesai|Terlambat|Dibatalkan', 'daftar sederhana: filter 5 langkah, tanpa kanban');
await page.waitForSelector('table.t');
await page.waitForSelector('#q');
await page.type('#q', NOMOR);
await page.keyboard.press('Enter');
await page.waitForFunction(() => location.hash.includes('q='));
await page.waitForSelector('table.t tbody tr');
ok((await page.$$('table.t tbody tr')).length === 1, 'pencarian nomor surat dari bilah atas');

ok(errors.length === 0, 'tidak ada galat JavaScript di konsol', errors.join(' | '));
await browser.close();
console.log(`\nHasil: ${pass} lulus, ${failN} gagal`);
process.exit(failN ? 1 : 0);
