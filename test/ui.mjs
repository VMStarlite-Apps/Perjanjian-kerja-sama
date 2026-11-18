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
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|net::/.test(m.text())) errors.push(m.text()); });
const waitText = (t, timeout = 15000) => page.waitForFunction((t) => document.body.innerText.includes(t), { timeout, polling: 250 }, t);
const clickText = async (sel, text) => {
  await page.waitForFunction((s, t) => [...document.querySelectorAll(s)].some((e) => e.innerText.trim().includes(t)), { timeout: 15000, polling: 250 }, sel, text);
  await page.evaluate((s, t) => [...document.querySelectorAll(s)].find((e) => e.innerText.trim().includes(t)).click(), sel, text);
};

console.log('Starlite — uji antarmuka\n');
await page.goto(BASE + '/#/perjanjian', { waitUntil: 'networkidle0' });
ok(await page.$('table.t'), 'daftar perjanjian tampil');

console.log('\nBuat perjanjian lewat form');
await clickText('button', 'Perjanjian baru');
await page.waitForSelector('dialog .picker button');
await page.type('#m-q', 'DESNARUM');
await page.waitForFunction(() => [...document.querySelectorAll('.picker button')].some((b) => b.innerText.includes('DESNARUM')), { timeout: 8000 });
await clickText('.picker button', 'DESNARUM');
const sel = await page.$eval('[data-sel]', (e) => e.innerText);
ok(sel.includes('desnarum.jayaakasha@gmail.com'), 'memilih mitra menampilkan email tujuan');
ok((await page.$eval('#m-judul', (e) => e.value)).includes('DESNARUM'), 'judul terisi otomatis');
const fi = await page.$('#m-file');
await fi.uploadFile(resolve('test/fixtures/3hal.pdf'));
await clickText('dialog button', 'Buat perjanjian');
await page.waitForFunction(() => location.hash.startsWith('#/perjanjian/pks_'), { timeout: 15000 });
await waitText('Kirim dokumen ke mitra');
ok(true, 'perjanjian dibuat dan halaman detail terbuka');
const detailUrl = page.url();

console.log('\nKirim, tanggapan, Legal, bagikan (melalui tombol UI)');
await clickText('button', 'Kirim ke mitra');
await waitText('Menunggu tanggapan mitra');
ok(true, 'tombol Kirim ke mitra memindahkan ke tahap 1');
await page.evaluate(() => document.querySelector('details.more summary').click());
await page.type('#fb-isi', 'Mitra setuju lewat telepon');
await clickText('button', 'Catat tanggapan');
await waitText('Mitra setuju lewat telepon');
ok(true, 'tanggapan manual tercatat');
await clickText('button', 'Serahkan ke Legal');
await waitText('Terbitkan nomor surat');
ok(true, 'diserahkan ke Legal (admin melihat form nomor)');
await page.type('#no', NOMOR);
await (await page.$('#no-file')).uploadFile(resolve('test/fixtures/3hal.pdf'));
await clickText('button', 'Terbitkan nomor');
await waitText('Bagikan perjanjian bernomor ke mitra');
ok(true, 'nomor surat terbit lewat UI');
const pid = detailUrl.split('/').pop();
// Ambil tautan portal dari respons tombol bagikan
const portalP = page.waitForResponse((r) => r.url().endsWith(`/api/perjanjian/${pid}/bagikan`));
await clickText('button', 'Bagikan ke mitra');
const portal = (await (await portalP).json()).portal;
await waitText('Menunggu tanda tangan mitra');
ok(portal && portal.includes('#t='), 'dibagikan, tautan portal dibuat');

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
await (await page.$('#full')).uploadFile(resolve('test/fixtures/3hal.pdf'));
await clickText('button', 'Unggah dan selesaikan');
await waitText('Perjanjian ditandatangani kedua pihak');
ok(true, 'perjanjian selesai lewat UI');
ok((await page.$$eval('.timeline li.done', (l) => l.length)) === 8, 'linimasa menandai seluruh 8 tahap selesai');
await page.screenshot({ path: 'test/out/detail-selesai.png', fullPage: false });

console.log('\nNavigasi lain');
await page.goto(BASE + '/#/mitra', { waitUntil: 'networkidle0' });
await clickText('table.t tbody tr td', 'DESNARUM');
await page.waitForSelector('dialog[open]');
ok((await page.$eval('dialog[open]', (d) => d.innerText))
  .includes(NOMOR), 'detail mitra memuat riwayat perjanjian');
await page.keyboard.press('Escape');
await page.goto(BASE + '/#/perjanjian', { waitUntil: 'networkidle0' });
await clickText('.seg-toggle button', 'Kanban');
await page.waitForSelector('.kanban .lane');
ok((await page.$$('.kanban .lane')).length === 8, 'tampilan kanban 8 kolom tahap');
await page.screenshot({ path: 'test/out/kanban.png' });
await clickText('.seg-toggle button', 'Tabel');
await page.waitForSelector('table.t #q, table.t');
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
