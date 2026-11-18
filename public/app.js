import { mountTtdWidget } from './ttd.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
const S = { me: null, meta: null };

// ---------- API ----------
// Frontend boleh di domain lain (GitHub Pages): window.STARLITE_API berisi alamat Worker, kosong bila satu domain.
// Sesi dikirim lewat header Authorization (tanpa cookie lintas situs); token disimpan di sessionStorage.
const BASE = String(window.STARLITE_API || '').replace(/\/$/, '');
const TKEY = 'starlite_token';
const tokenGet = () => { try { return sessionStorage.getItem(TKEY); } catch { return null; } };
const tokenSet = (t) => { try { t ? sessionStorage.setItem(TKEY, t) : sessionStorage.removeItem(TKEY); } catch {} };
async function api(path, opts = {}) {
  const t = tokenGet();
  const headers = { ...(opts.headers || {}), ...(t ? { authorization: `Bearer ${t}` } : {}) };
  const r = await fetch(BASE + path, { credentials: BASE ? 'omit' : 'same-origin', ...opts, headers });
  const ct = r.headers.get('content-type') || '';
  if (r.ok && ct.includes('application/pdf')) return r.blob();
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && !path.startsWith('/api/login') && S.me) { S.me = null; showLogin('Sesi berakhir, silakan masuk lagi.'); }
    throw Object.assign(new Error(j.error || `Permintaan gagal (${r.status})`), { status: r.status });
  }
  return j;
}
const post = (p, body) => api(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
const postForm = (p, fd) => api(p, { method: 'POST', body: fd });

function toast(msg, err = false) {
  $('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.setAttribute('role', err ? 'alert' : 'status');
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), err ? 6000 : 3200);
}
async function busy(btn, fn) {
  const old = btn.innerHTML; btn.disabled = true;
  try { return await fn(); } catch (e) { toast(e.message, true); } finally { btn.disabled = false; btn.innerHTML = old; }
}

// ---------- Ikon ----------
const P = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  stamp: '<path d="M5 21h14M6 17h12v-3a3 3 0 0 0-3-3h-1V8a2 2 0 1 0-4 0v3H9a3 3 0 0 0-3 3z"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
};
const ic = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;

// ---------- Format ----------
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const tgl = (iso) => { if (!iso) return '–'; const d = new Date(iso.length === 10 ? iso + 'T00:00:00+07:00' : iso); return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`; };
const jam = (iso) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
function sisa(iso) {
  if (!iso) return null;
  const d = (new Date(iso) - Date.now()) / 86400000;
  if (d < 0) return { label: `Lewat ${Math.max(1, Math.round(-d))} hari`, cls: 'c-late' };
  if (d < 1) return { label: 'Hari ini', cls: 'c-warn' };
  const n = Math.ceil(d);
  return { label: `${n} hari lagi`, cls: n <= 3 ? 'c-warn' : 'c-info' };
}
const chipSisa = (iso) => { const s = sisa(iso); return s ? `<span class="chip ${s.cls}">${s.label}</span>` : ''; };
const TAMPIL = { draf: ['Draf', 'c-idle'], berjalan: ['Berjalan', 'c-info'], terlambat: ['Terlambat', 'c-late'], aktif: ['Aktif', 'c-ok'], akan_berakhir: ['Akan berakhir', 'c-warn'], berakhir: ['Berakhir', 'c-idle'], batal: ['Dibatalkan', 'c-idle'] };
const chipTampil = (t) => { const [l, c] = TAMPIL[t] || [t, 'c-idle']; return `<span class="chip ${c}">${l}</span>`; };
const tahapNama = (n) => S.meta?.tahap?.[n]?.nama || `Tahap ${n}`;
const aktor = (a, nama) => nama || (!a ? '' : a === 'sistem' ? 'Sistem' : a.startsWith('mitra:') ? 'Mitra' : a.split('@')[0].replace(/[._]/g, ' '));
const AKSI = {
  perjanjian_dibuat: 'membuat perjanjian', dikirim_ke_mitra: 'mengirim dokumen ke mitra', feedback_diterima: 'mencatat tanggapan mitra',
  diserahkan_ke_legal: 'menyerahkan ke Legal', nomor_terbit: 'menerbitkan nomor surat', dibagikan_ke_mitra: 'membagikan perjanjian bernomor',
  dokumen_diunggah: 'mengunggah dokumen', ttd_mitra_disetujui: 'menyetujui TTD mitra', ttd_mitra_ditolak: 'meminta TTD mitra diunggah ulang',
  perjanjian_selesai: 'menyelesaikan perjanjian', tahap_dikembalikan: 'mengembalikan tahap', perjanjian_dibatalkan: 'membatalkan perjanjian',
  dokumen_diunduh: 'mengunduh dokumen', dokumen_diunduh_mitra: 'mengunduh dokumen', dokumen_tidak_sesuai: 'menandai berkas tidak sesuai',
  pengguna_disimpan: 'memperbarui pengguna', konfig_diubah: 'mengubah pengaturan', jenis_disimpan: 'mengubah jenis perjanjian', email_final_gagal: 'gagal mengirim salinan final',
};
const JENIS_DOK = { master: 'Master', bernomor: 'Bernomor', ttd_mitra: 'TTD mitra', final: 'Final', lampiran: 'Lampiran' };
const can = (...roles) => S.me && (S.me.peran === 'admin' || roles.includes(S.me.peran));
const ls = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

// ---------- Kerangka ----------
function renderNav(active) {
  const items = [['#/', 'home', 'Ringkasan', 'home'], ['#/perjanjian', 'file', 'Perjanjian', 'perjanjian'], ['#/mitra', 'users', 'Mitra', 'mitra']];
  if (can()) items.push(['#/pengaturan', 'gear', 'Pengaturan', 'pengaturan']);
  $('#nav').innerHTML = items.map(([h, i, l, k]) => `<a href="${h}" ${k === active ? 'aria-current="page"' : ''}>${ic(i)}<span>${l}</span></a>`).join('');
  $('#foot').innerHTML = `<div>${S.me.mode.google ? 'Terhubung ke <b>Google Drive</b> dan <b>Gmail</b>' : '<b>Mode pengembangan</b><br>Email disimulasikan, berkas disimpan sementara.'}</div>
    <div class="foot-acts"><button class="btn ghost sm" data-ganti type="button">Ganti password</button><button class="btn ghost sm" data-keluar type="button">Keluar</button></div>`;
  $('[data-keluar]').addEventListener('click', keluar);
  $('[data-ganti]').addEventListener('click', () => bukaGanti(false));
}

// ---------- Masuk, keluar, ganti password ----------
function shell(tampil) { $('.side').hidden = !tampil; $('.shell').classList.toggle('tanpa-menu', !tampil); }

function showLogin(pesan = '') {
  shell(false);
  app.innerHTML = `<div class="login"><form class="card login-card" data-login novalidate>
    <img src="logo.png" alt="" class="login-logo"><h1>Masuk ke Starlite</h1><p class="muted">Pemantauan perjanjian kerja sama mitra</p>
    <p class="login-err" role="alert" data-err>${esc(pesan)}</p>
    <div class="field"><label for="l-email">Email</label><input class="input" id="l-email" name="email" type="email" autocomplete="username" required autofocus></div>
    <div class="field"><label for="l-pw">Password</label><input class="input" id="l-pw" name="password" type="password" autocomplete="current-password" required></div>
    <button class="btn" style="width:100%;justify-content:center">Masuk</button></form></div>`;
  const f = $('[data-login]');
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const err = $('[data-err]');
    err.textContent = '';
    busy($('button', f), async () => {
      try { const r = await post('/api/login', { email: f.email.value, password: f.password.value }); tokenSet(r.token); }
      catch (ex) { err.textContent = ex.message; f.password.value = ''; f.password.focus(); return; }
      await mulai();
    });
  });
}

function formGanti(wajib) {
  return `<form data-gf class="stack" novalidate>
    ${wajib ? '<p class="muted" style="margin-top:0">Password Anda masih sementara. Buat password baru untuk melanjutkan.</p>' : ''}
    <p class="login-err" role="alert" data-err></p>
    <div class="field"><label for="g-lama">Password ${wajib ? 'sementara' : 'lama'}</label><input class="input" id="g-lama" name="lama" type="password" autocomplete="current-password" required></div>
    <div class="field"><label for="g-baru">Password baru</label><input class="input" id="g-baru" name="baru" type="password" autocomplete="new-password" required minlength="10"><span class="hint">Minimal 10 karakter.</span></div>
    <div class="field"><label for="g-ulang">Ulangi password baru</label><input class="input" id="g-ulang" name="ulang" type="password" autocomplete="new-password" required></div>
    <button class="btn">Simpan password</button></form>`;
}
function ikatGanti(root, selesai) {
  const f = $('[data-gf]', root), err = $('[data-err]', root);
  f.addEventListener('submit', (e) => {
    e.preventDefault(); err.textContent = '';
    if (f.baru.value !== f.ulang.value) { err.textContent = 'Pengulangan password tidak sama'; return; }
    busy($('button', f), async () => {
      try { await post('/api/ganti-password', { lama: f.lama.value, baru: f.baru.value }); }
      catch (ex) { err.textContent = ex.message; return; }
      toast('Password diganti'); selesai();
    });
  });
}
function layarGanti() {
  shell(false);
  app.innerHTML = `<div class="login"><div class="card login-card"><h1>Buat password baru</h1>${formGanti(true)}</div></div>`;
  ikatGanti(app, () => mulai());
}
function bukaGanti(wajib) {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<div class="dh"><h2>Ganti password</h2><button class="icon-btn" data-x aria-label="Tutup" type="button">✕</button></div><div class="db" style="padding-bottom:20px">${formGanti(wajib)}</div>`;
  document.body.append(dlg); dlg.showModal();
  dlg.addEventListener('close', () => dlg.remove());
  $('[data-x]', dlg).addEventListener('click', () => dlg.close());
  ikatGanti(dlg, () => dlg.close());
}
async function keluar() {
  try { await post('/api/logout'); } catch {}
  tokenSet(null);
  S.me = null; showLogin('Anda sudah keluar.');
}
function tampilkanPassword(email, password) {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<div class="dh"><h2>Password sementara</h2></div>
    <div class="db"><p>Berikan kepada <b>${esc(email)}</b>. Password ini hanya tampil sekali dan wajib diganti saat masuk pertama.</p>
    <p><code class="pw" data-pw>${esc(password)}</code></p></div>
    <div class="df"><button class="btn ghost" data-salin type="button">Salin</button><button class="btn" data-x type="button">Selesai</button></div>`;
  document.body.append(dlg); dlg.showModal();
  dlg.addEventListener('close', () => dlg.remove());
  $('[data-x]', dlg).addEventListener('click', () => dlg.close());
  $('[data-salin]', dlg).addEventListener('click', () => navigator.clipboard?.writeText(password).then(() => toast('Disalin')));
}

function topbar(title, sub, telat = 0) {
  const ini = (S.me.nama || S.me.email).split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return `<header class="top">
    <div class="greet"><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>
    <form class="search" role="search" data-search>${ic('search')}<label class="sr" for="q">Cari perjanjian</label><input id="q" name="q" placeholder="Cari mitra, nomor surat, kode"></form>
    <a class="icon-btn" href="#/perjanjian?status=terlambat" aria-label="${telat} perjanjian terlambat">${ic('bell')}${telat ? `<span class="dot">${telat}</span>` : ''}</a>
    <div class="who"><div class="avatar">${esc(ini)}</div><div><b>${esc(S.me.nama)}</b><span>${esc(S.me.peran === 'vm' ? 'Vendor Management' : S.me.peran)}</span></div></div>
  </header>`;
}
function bindSearch() {
  $('[data-search]')?.addEventListener('submit', (e) => { e.preventDefault(); location.hash = `#/perjanjian?q=${encodeURIComponent(e.target.q.value.trim())}`; });
}
const salam = () => { const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Jakarta' })); return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam'; };

// ---------- Ringkasan ----------
function spark(series, color, id) {
  const w = 160, h = 52, max = Math.max(1, ...series);
  const pts = series.map((v, i) => [(i / (series.length - 1)) * w, h - 6 - (v / max) * (h - 14)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="${line} L${w},${h} L0,${h} Z" fill="url(#g${id})"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}

async function pageDashboard() {
  const d = await api('/api/dashboard');
  const k = d.kpi;
  const kpis = [
    { key: 'berjalan', lbl: 'Perjanjian berjalan', icon: 'file', bg: 'var(--sky)', fg: 'var(--blue-d)', color: '#2F9BEF', chip: ['Dalam proses', 'c-info'], href: '#/perjanjian?status=berjalan' },
    { key: 'legal', lbl: 'Menunggu Legal', icon: 'stamp', bg: '#E8EEF6', fg: 'var(--navy)', color: '#0B3B75', chip: k.legal ? ['Antre nomor surat', 'c-warn'] : ['Tidak ada antrean', 'c-ok'], href: '#/perjanjian?tahap=3' },
    { key: 'telat', lbl: 'Lewat tenggat', icon: 'clock', bg: 'var(--late-bg)', fg: 'var(--late)', color: '#C93838', chip: k.telat ? ['Perlu tindakan', 'c-late'] : ['Semua tepat waktu', 'c-ok'], href: '#/perjanjian?status=terlambat' },
    { key: 'selesai', lbl: 'Selesai bulan ini', icon: 'check', bg: 'var(--ok-bg)', fg: 'var(--ok)', color: '#17885A', chip: ['Ditandatangani', 'c-ok'], href: '#/perjanjian?tahap=7' },
  ];
  const max = Math.max(1, ...d.pipeline.filter((s) => s.n < 7).map((s) => s.jumlah));
  const lvl = (s) => { const v = s.jumlah; if (s.n === 7) return v ? 'done' : 'l0'; const r = v / max; return !v ? 'l0' : r <= .25 ? 'l1' : r <= .5 ? 'l2' : r <= .8 ? 'l3' : 'l4'; };
  const tindakan = d.tindakan.length
    ? `<ul class="list">${d.tindakan.map((t) => `<li><span class="bullet" style="background:${sisa(t.tenggat)?.cls === 'c-late' ? 'var(--late)' : 'var(--blue)'}"></span>
        <a href="#/perjanjian/${t.id}" style="min-width:0;color:inherit;text-decoration:none"><div class="t">${esc(t.mitra)}</div><div class="s">${esc(tahapNama(t.tahap))}, ${esc(t.nomor_surat || t.kode)}</div></a>
        <span class="time">${t.tenggat ? tgl(t.tenggat) : ''}</span>${chipSisa(t.tenggat) || '<span class="chip c-idle">Draf</span>'}</li>`).join('')}</ul>`
    : `<div class="empty"><b>Tidak ada tindakan tertunda</b>${can('vm') ? 'Mulai dengan membuat perjanjian baru.' : 'Antrean Anda kosong.'}</div>`;
  const durOf = (n) => d.durasi.find((x) => x.tahap === n)?.hari;
  const trenMax = Math.max(1, ...d.tren.map((t) => Math.max(t.masuk, t.selesai)));
  const bln = (m) => BULAN[Number(m.slice(5, 7)) - 1];
  const sub = d.tindakan.length ? `${d.tindakan.length} perjanjian menunggu tindakan${k.telat ? `, ${k.telat} lewat tenggat` : ''}.` : 'Semua perjanjian berjalan sesuai jadwal.';
  app.innerHTML = `${topbar(`${salam()}, ${esc(S.me.nama)}`, sub, k.telat)}
    ${S.me.mode.env === 'dev' ? '<div class="mode-banner">Mode pengembangan: email disimulasikan dan berkas disimpan di database lokal.</div>' : ''}
    <section class="grid kpis" aria-label="Ringkasan angka">${kpis.map((x) => `
      <a class="card kpi" href="${x.href}">
        <div class="kpi-h"><span class="ic" style="background:${x.bg};color:${x.fg}">${ic(x.icon)}</span><span class="lbl">${x.lbl}</span></div>
        <div class="kpi-b"><div><span class="val num">${k[x.key]}</span><span class="chip ${x.chip[1]}">${x.chip[0]}</span></div>${spark(d.spark[x.key], x.color, x.key)}</div></a>`).join('')}
    </section>
    <section class="grid dash-2">
      <div class="card"><div class="card-head"><h2>Lintasan perjanjian</h2><a class="small" href="#/perjanjian">Lihat semua</a></div>
        <div class="track">${d.pipeline.map((s) => `<a class="seg ${lvl(s)}" href="#/perjanjian?tahap=${s.n}"><div class="bar"><b class="num">${s.jumlah}</b></div><span class="name">${esc(s.nama)}</span><span class="dur">${s.n < 7 ? (durOf(s.n) ? `${durOf(s.n)} hari` : '–') : ''}</span></a>`).join('')}</div>
        <p class="small muted" style="margin:6px 0 0">Angka di bawah nama tahap: rata-rata lama tahap itu berlangsung.</p>
        <div class="track-foot"><div><b>Selesai tepat waktu</b><div class="small muted">Tahap yang ditutup sebelum tenggat</div></div><div class="meter" aria-hidden="true"><i style="width:${d.tepat_waktu ?? 0}%"></i></div><b class="num" style="font-size:22px;color:var(--navy)">${d.tepat_waktu === null ? '–' : d.tepat_waktu + '%'}</b></div>
      </div>
      <div class="card"><div class="card-head"><h2>Tindakan hari ini</h2>${can('vm') ? `<button class="btn sm" data-new>${ic('plus')}Perjanjian baru</button>` : ''}</div>${tindakan}</div>
    </section>
    <section class="grid dash-3">
      <div class="card"><div class="card-head"><h2>Tren bulanan</h2><span class="row small"><span class="lg" style="background:var(--blue)"></span>Masuk <span class="lg" style="background:var(--navy)"></span>Selesai</span></div>
        ${d.tren.length ? `<div class="bars two">${d.tren.map((t) => `<div class="b"><div class="pair"><i style="height:${Math.max(4, (t.masuk / trenMax) * 100)}%" title="${t.masuk} masuk"></i><i class="alt" style="height:${Math.max(4, (t.selesai / trenMax) * 100)}%" title="${t.selesai} selesai"></i></div><span>${bln(t.m)}</span><em class="num">${t.masuk}/${t.selesai}</em></div>`).join('')}</div>` : '<div class="empty"><b>Belum ada data</b></div>'}
      </div>
      <div class="card"><div class="card-head"><h2>Aktivitas terbaru</h2></div>
        ${d.aktivitas.length ? `<ul class="list">${d.aktivitas.map((a) => `<li style="grid-template-columns:minmax(0,1fr) auto"><div style="min-width:0"><div class="t" style="font-weight:600">${esc(aktor(a.aktor, a.aktor_nama))} <span style="font-weight:500">${esc(AKSI[a.aksi] || a.aksi)}</span></div><div class="s">${a.id ? `<a href="#/perjanjian/${a.id}">${esc(a.mitra || a.kode)}</a>` : ''}</div></div><span class="small muted">${jam(a.waktu)}</span></li>`).join('')}</ul>` : '<div class="empty"><b>Belum ada aktivitas</b></div>'}
      </div>
      <div class="card"><div class="card-head"><h2>Masa berlaku</h2><span class="small muted">90 hari ke depan</span></div>
        ${d.berakhir.length ? `<ul class="list">${d.berakhir.map((b) => `<li style="grid-template-columns:minmax(0,1fr) auto"><a href="#/perjanjian/${b.id}" style="color:inherit;min-width:0"><div class="t">${esc(b.mitra)}</div><div class="s">${esc(b.nomor_surat)}</div></a>${chipSisa(b.tgl_berakhir + 'T23:59:00+07:00')}</li>`).join('')}</ul>` : '<div class="empty"><b>Tidak ada yang berakhir</b>Perjanjian yang habis dalam 90 hari tampil di sini.</div>'}
        ${d.pic.length ? `<h3 style="margin:16px 0 8px">Beban per PIC</h3>${d.pic.map((p) => `<div class="row" style="justify-content:space-between;padding:4px 0"><span>${esc(p.nama)}</span><b class="num">${p.n}</b></div>`).join('')}` : ''}
      </div>
    </section>`;
  bindSearch();
  $('[data-new]')?.addEventListener('click', () => openCreate());
}

// ---------- Daftar perjanjian ----------
async function pagePerjanjian(params) {
  const q = params.get('q') || '', tahap = params.get('tahap') ?? '', status = params.get('status') || '';
  const view = ls.get('starlite.view', 'tabel');
  const qs = new URLSearchParams(); if (q) qs.set('q', q); if (tahap !== '') qs.set('tahap', tahap); if (status) qs.set('status', status);
  const rows = await api('/api/perjanjian?' + qs);
  const filters = [['', '', 'Semua'], ...S.meta.tahap.map((t) => [String(t.n), '', t.nama]), ['', 'terlambat', 'Terlambat'], ['', 'batal', 'Dibatalkan']];
  const isOn = (t, s) => (t === tahap && s === status) || (!t && !s && tahap === '' && !status);
  const table = rows.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Mitra</th><th>Perjanjian</th><th>Tahap</th><th>Nomor surat</th><th>Tenggat</th><th>Status</th></tr></thead><tbody>
    ${rows.map((p) => `<tr data-href="#/perjanjian/${p.id}" tabindex="0"><td><div class="cell-main">${esc(p.mitra_nama)}</div><div class="cell-sub">${esc(p.kode)}</div></td><td>${esc(p.judul)}</td><td>${esc(tahapNama(p.tahap))}</td><td>${esc(p.nomor_surat || '–')}</td><td class="nw">${p.tahap < 7 && p.status !== 'batal' ? (p.tenggat ? `${tgl(p.tenggat)}<div class="cell-sub">${sisa(p.tenggat)?.label}</div>` : '–') : '–'}</td><td>${chipTampil(p.tampil)}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="empty"><b>${q || tahap !== '' || status ? 'Tidak ada perjanjian yang cocok' : 'Belum ada perjanjian'}</b>${can('vm') ? 'Buat perjanjian baru dari data info perseroan.' : ''}</div>`;
  const kanban = `<div class="kanban" style="grid-template-columns:repeat(8,minmax(210px,1fr))">${S.meta.tahap.map((t) => { const items = rows.filter((p) => p.tahap === t.n && p.status !== 'batal'); return `<div class="lane"><h3><span>${esc(t.nama)}</span><span class="muted num">${items.length}</span></h3>${items.map((p) => `<a class="kcard" href="#/perjanjian/${p.id}"><b>${esc(p.mitra_nama)}</b><span>${esc(p.nomor_surat || p.kode)}</span><div style="margin-top:8px">${t.n < 7 ? chipSisa(p.tenggat) : chipTampil(p.tampil)}</div></a>`).join('')}</div>`; }).join('')}</div>`;
  app.innerHTML = `${topbar('Perjanjian', `${rows.length} perjanjian${q ? ` untuk "${esc(q)}"` : ''}`)}
    <div class="card">
      <div class="card-head" style="flex-wrap:wrap"><div class="tabs" role="group" aria-label="Saring tahap">${filters.map(([t, s, l]) => `<button aria-pressed="${isOn(t, s)}" data-t="${t}" data-s="${s}">${esc(l)}</button>`).join('')}</div>
        <div class="row"><div class="seg-toggle" role="group" aria-label="Tampilan"><button aria-pressed="${view === 'tabel'}" data-view="tabel">Tabel</button><button aria-pressed="${view === 'kanban'}" data-view="kanban">Kanban</button></div>${can('vm') ? `<button class="btn" data-new>${ic('plus')}Perjanjian baru</button>` : ''}</div></div>
      ${view === 'kanban' ? kanban : table}
    </div>`;
  bindSearch();
  if (q) $('#q').value = q;
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => { const n = new URLSearchParams(); if (q) n.set('q', q); if (b.dataset.t) n.set('tahap', b.dataset.t); if (b.dataset.s) n.set('status', b.dataset.s); location.hash = '#/perjanjian' + (n.toString() ? '?' + n : ''); }));
  $$('[data-view]').forEach((b) => b.addEventListener('click', () => { ls.set('starlite.view', b.dataset.view); route(); }));
  $$('tr[data-href]').forEach((tr) => {
    tr.addEventListener('click', () => { location.hash = tr.dataset.href; });
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') location.hash = tr.dataset.href; });
  });
  $('[data-new]')?.addEventListener('click', () => openCreate());
}

// ---------- Buat perjanjian ----------
async function openCreate(preset) {
  try { S.tpl ||= await api('/api/template'); } catch (e) { return toast(e.message, true); }
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<form method="dialog" data-f>
    <div class="dh"><h2>Perjanjian baru</h2><button class="icon-btn" value="cancel" aria-label="Tutup" formnovalidate>✕</button></div>
    <div class="db">
      <div class="field"><label for="m-q">Mitra</label><input class="input" id="m-q" placeholder="Ketik nama mitra" autocomplete="off"><div class="picker" role="listbox" aria-label="Pilihan mitra"></div><div class="hint" data-sel>Data diambil dari info perseroan.</div></div>
      <div class="field"><label for="m-jenis">Jenis perjanjian</label><select class="input" id="m-jenis" name="jenis">${S.meta.jenis.map((j) => `<option value="${esc(j.kode)}">${esc(j.nama)}</option>`).join('')}</select></div>
      <div class="field"><label for="m-judul">Judul</label><input class="input" id="m-judul" name="judul" required minlength="3"></div>
      <fieldset class="isian"><legend>Isian dokumen</legend><p class="hint" style="margin:0 0 10px">Dokumen memakai format Perjanjian Pengadaan Jasa. Hanya bagian kuning ini yang dapat diisi; isi lainnya terkunci. Nomor surat diterbitkan Legal.</p>
        ${S.tpl.fields.map((f) => `<div class="field"><label for="i-${f.key}">${esc(f.label)}</label><input class="input" id="i-${f.key}" data-isi="${f.key}" ${f.type === 'date' ? 'type="date" min="2026-01-01" max="2026-12-31"' : `type="text" maxlength="${S.tpl.maks[f.key] || 120}" autocomplete="off"`} required>${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}</div>`).join('')}
      </fieldset>
    </div>
    <div class="df"><button class="btn ghost" value="cancel" formnovalidate>Batal</button><button class="btn" value="ok" data-submit>Buat perjanjian</button></div></form>`;
  document.body.append(dlg); dlg.showModal();
  dlg.addEventListener('close', () => dlg.remove());
  let chosen = null, timer;
  const pick = $('.picker', dlg), qi = $('#m-q', dlg), judul = $('#m-judul', dlg);
  const choose = (m) => {
    chosen = m; qi.value = m.nama;
    $('[data-sel]', dlg).innerHTML = m.emails.length ? `Dikirim ke ${m.emails.map(esc).join(', ')}` : `<span style="color:var(--late);font-weight:600">Email mitra kosong di info perseroan. Perjanjian bisa dibuat, tetapi belum bisa dikirim.</span>`;
    if (!judul.value) judul.value = `${$('#m-jenis', dlg).selectedOptions[0].text} ${m.singkat || m.nama}`;
    const pre = { nama: m.nama, direksi: m.direksi, alamat: m.alamat, telepon: m.telepon, email: m.emails?.[0], kontak_lain: m.kontak_lain };
    S.tpl.fields.forEach((f) => { const el = $(`[data-isi="${f.key}"]`, dlg); if (el && f.prefill) el.value = String(pre[f.prefill] || '').slice(0, el.maxLength > 0 ? el.maxLength : 200); });
    pick.innerHTML = '';
  };
  const load = async (q) => {
    const list = await api(q ? `/api/mitra?q=${encodeURIComponent(q)}` : '/api/mitra?batch=1');
    pick.innerHTML = list.slice(0, 40).map((m, i) => `<button type="button" role="option" data-i="${i}">${esc(m.nama)}<small>${esc(m.jenis || 'Mitra')}, ${esc(m.status)}${m.emails.length ? '' : ', email kosong'}</small></button>`).join('') || '<div class="empty">Mitra tidak ditemukan</div>';
    $$('button', pick).forEach((b) => b.addEventListener('click', () => choose(list[b.dataset.i])));
  };
  qi.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => load(qi.value.trim()), 220); });
  if (preset) choose(preset); else load('');
  $('[data-submit]', dlg).addEventListener('click', async (e) => {
    e.preventDefault();
    const f = $('[data-f]', dlg);
    if (!chosen) return toast('Pilih mitra terlebih dahulu', true);
    if (!f.reportValidity()) return;
    const fd = new FormData(f); fd.set('mitra_row', chosen.row);
    fd.set('isi', JSON.stringify(Object.fromEntries($$('[data-isi]', dlg).map((el) => [el.dataset.isi, el.value]))));
    await busy(e.currentTarget, async () => { const r = await postForm('/api/perjanjian', fd); dlg.close(); toast('Perjanjian dibuat'); location.hash = `#/perjanjian/${r.id}`; });
  });
}

// ---------- Ubah isian kuning pada dokumen ----------
async function bukaIsian(p, reload) {
  let nilai;
  try { S.tpl ||= await api('/api/template'); nilai = await api(`/api/perjanjian/${p.id}/isian`); } catch (e) { return toast(e.message, true); }
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<form method="dialog" data-f><div class="dh"><h2>Ubah isian dokumen</h2><button class="icon-btn" value="cancel" aria-label="Tutup" formnovalidate>✕</button></div>
    <div class="db"><p class="hint" style="margin:0 0 12px">Hanya bagian kuning pada dokumen yang dapat diubah. Menyimpan membuat dokumen master versi baru.</p>
    ${S.tpl.fields.map((f) => `<div class="field"><label for="u-${f.key}">${esc(f.label)}</label><input class="input" id="u-${f.key}" data-isi="${f.key}" ${f.type === 'date' ? 'type="date" min="2026-01-01" max="2026-12-31"' : `type="text" maxlength="${S.tpl.maks[f.key] || 120}" autocomplete="off"`} value="${esc(nilai[f.key])}" required></div>`).join('')}</div>
    <div class="df"><button class="btn ghost" value="cancel" formnovalidate>Batal</button><button class="btn" data-simpan>Simpan isian</button></div></form>`;
  document.body.append(dlg); dlg.showModal();
  dlg.addEventListener('close', () => dlg.remove());
  $('[data-simpan]', dlg).addEventListener('click', (e) => {
    e.preventDefault();
    if (!$('[data-f]', dlg).reportValidity()) return;
    busy(e.currentTarget, async () => {
      await post(`/api/perjanjian/${p.id}/isian`, { isi: Object.fromEntries($$('[data-isi]', dlg).map((el) => [el.dataset.isi, el.value])) });
      dlg.close(); toast('Isian diperbarui, dokumen versi baru dibuat'); reload();
    });
  });
}

// ---------- Detail perjanjian ----------
async function pageDetail(id) {
  const p = await api(`/api/perjanjian/${id}`);
  const m = p.mitra;
  const cur = p.status === 'batal' ? -1 : p.tahap;
  const riwayatOf = (n) => p.riwayat.filter((r) => r.tahap === n).at(-1);
  const timeline = S.meta.tahap.map((t) => {
    const r = riwayatOf(t.n);
    const cls = t.n < cur || (t.n === 7 && cur === 7) ? 'done' : t.n === cur ? 'now' : '';
    const info = t.n === cur && t.n < 7 && p.tenggat ? `Tenggat ${tgl(p.tenggat)}` : r ? (r.selesai ? `Selesai ${tgl(r.selesai)}` : `Mulai ${tgl(r.mulai)}`) : '';
    return `<li class="${cls}"><span class="node">${cls === 'done' ? '✓' : t.n}</span><b>${esc(t.nama)}</b><span>${info}</span></li>`;
  }).join('');
  const docs = p.dokumen.length ? `<ul class="list docs">${p.dokumen.map((d) => `<li><span class="fi">${ic('file')}</span><div style="min-width:0"><div class="t">${esc(JENIS_DOK[d.jenis])}, versi ${d.versi}</div><div class="s">${tgl(d.dibuat_pada)} oleh ${esc(aktor(d.pengunggah, d.pengunggah_nama))}${d.halaman ? `, ${d.halaman} halaman` : ''} <span class="hash" title="SHA-256 ${esc(d.sha256)}">#${esc(d.sha256.slice(0, 10))}</span></div></div>
    <span>${d.penanda ? `<span class="chip ${d.penanda === 'scan_asli' ? 'c-ok' : 'c-info'}">${d.penanda === 'scan_asli' ? 'Scan asli' : 'Hasil tempel'}</span>` : ''} ${d.status !== 'aktif' ? `<span class="chip ${d.status === 'tidak_sesuai' ? 'c-late' : d.status === 'menunggu_review' ? 'c-warn' : 'c-idle'}">${{ tidak_sesuai: 'Tidak sesuai', menunggu_review: 'Menunggu review', ditolak: 'Ditolak' }[d.status]}</span>` : ''}</span>
    <a class="btn ghost sm" href="#" data-dok="${d.id}">${ic('download')}Buka</a></li>`).join('')}</ul>` : '<div class="empty">Belum ada dokumen</div>';
  const ubahIsian = can('vm') && p.status !== 'batal' && p.tahap <= 2 ? `<div style="margin-top:12px"><button class="btn ghost sm" data-isian type="button">${ic('file')}Ubah isian dokumen</button><div class="hint" style="margin-top:6px">Hanya bagian kuning pada dokumen yang dapat diubah.</div></div>` : '';
  const fb = p.feedback.length ? p.feedback.map((f) => `<div class="fb ${f.setuju ? 'agree' : ''}"><div class="small"><b>Putaran ${f.putaran}</b> <span class="muted">dari ${esc(f.pengirim || 'mitra')} via ${esc(f.sumber)}, ${jam(f.diterima_pada)}</span></div><p>${esc(f.isi)}</p></div>`).join('') : '<div class="empty">Belum ada tanggapan mitra</div>';
  app.innerHTML = `<div class="crumb"><a href="#/perjanjian">Perjanjian</a> / ${esc(p.kode)}</div>
    ${topbar(esc(m.nama), `${esc(p.judul)}`)}
    <div class="row" style="margin:-8px 0 18px">${chipTampil(p.tampil)}<span class="chip c-idle">${esc(p.kode)}</span>${p.nomor_surat ? `<span class="chip c-info">No. ${esc(p.nomor_surat)}</span>` : ''}</div>
    <div class="detail">
      <div class="stack">
        <div class="card"><h2 style="margin-bottom:16px">Alur</h2><ol class="timeline">${timeline}</ol></div>
        <div class="card"><h2 style="margin-bottom:12px">Info perseroan</h2><dl class="kv">
          <dt>Perusahaan</dt><dd>${esc(m.nama)}</dd><dt>Direksi</dt><dd>${esc(m.direksi || '–')}</dd><dt>Alamat</dt><dd>${esc(m.alamat || '–')}</dd>
          <dt>Email tujuan</dt><dd>${m.emails.length ? m.emails.map(esc).join('<br>') : '<span style="color:var(--late)">Kosong</span>'}</dd>
          <dt>PIC</dt><dd>${esc(p.pic_nama)}</dd><dt>Berlaku</dt><dd>${p.tgl_efektif ? `${tgl(p.tgl_efektif)} – ${tgl(p.tgl_berakhir)}` : '–'}</dd></dl>
          <p class="small muted" style="margin:12px 0 0">Salinan data per ${tgl(m.diambil_pada)}. Sumber: tabel mitra (info perseroan).</p></div>
      </div>
      <div class="stack">
        <div class="card action" id="action"></div>
        <div class="card"><div class="card-head"><h2>Dokumen</h2><span class="small muted">Terkunci, setiap versi tersimpan</span></div>${docs}${ubahIsian}</div>
        <div class="card"><div class="card-head"><h2>Tanggapan mitra</h2></div>${fb}</div>
        <div class="card"><details class="more"><summary>Riwayat email (${p.email.length}) dan jejak audit (${p.audit.length})</summary>
          <h3 style="margin:14px 0 6px">Email</h3><ul class="list audit">${p.email.map((e) => `<li><span class="muted">${jam(e.waktu)}</span><span>${esc(e.subjek)}<br><span class="small muted">ke ${esc(e.penerima)}, ${e.status === 'gagal' ? `<b style="color:var(--late)">gagal: ${esc(e.galat)}</b>` : e.mode === 'simulasi' ? 'simulasi' : 'terkirim'}</span></span></li>`).join('') || '<li><span></span><span class="muted">Belum ada</span></li>'}</ul>
          <h3 style="margin:14px 0 6px">Audit</h3><ul class="list audit">${p.audit.map((a) => `<li><span class="muted">${jam(a.waktu)}</span><span><b>${esc(aktor(a.aktor, a.aktor_nama))}</b> ${esc(AKSI[a.aksi] || a.aksi)}</span></li>`).join('')}</ul></details></div>
      </div>
    </div>`;
  bindSearch();
  renderAction(p);
}

function renderAction(p) {
  const box = $('#action');
  const m = p.mitra;
  const reload = () => pageDetail(p.id);
  $('[data-isian]')?.addEventListener('click', () => bukaIsian(p, reload));
  const doIt = (sel, fn, ok) => box.querySelector(sel)?.addEventListener('click', (e) => busy(e.currentTarget, async () => { const r = await fn(); if (r?.portal) console.info('Tautan portal (mode dev):', r.portal); toast(ok); reload(); }));
  let html = '';
  const head = (eyebrow, title, desc) => `<div class="eyebrow">${eyebrow}</div><h2 style="margin:4px 0 6px">${title}</h2>${desc ? `<p class="muted" style="margin:0 0 14px">${desc}</p>` : ''}`;
  if (p.status === 'batal') html = head('Dibatalkan', 'Perjanjian dibatalkan', esc(p.alasan_batal));
  else if (p.tahap === 0) {
    html = head('Langkah berikutnya', 'Kirim dokumen ke mitra', m.emails.length ? `Email beserta dokumen dan tautan tanggapan dikirim dari ${esc(S.me.mode.google ? 'akun Vendor Management' : 'mode simulasi')} ke ${m.emails.map(esc).join(', ')}.` : '')
      + (m.emails.length ? (can('vm') ? `<button class="btn" data-a="kirim">${ic('send')}Kirim ke mitra</button>` : '') : `<div class="notice">Email mitra kosong di info perseroan. Lengkapi kolom email pada tabel mitra di Cloudflare, lalu muat ulang halaman ini.</div>`);
  } else if (p.tahap === 1 || p.tahap === 2) {
    html = head(p.tahap === 1 ? 'Menunggu mitra' : 'Tanggapan diterima', p.tahap === 1 ? 'Menunggu tanggapan mitra' : 'Tinjau tanggapan, lalu serahkan ke Legal', p.tahap === 1 ? `Batas tanggapan ${tgl(p.tenggat)}. Balasan email mitra tercatat otomatis.` : 'Feedback dicatat sebagai catatan; isi dokumen tidak berubah. Bila perlu revisi isi, Legal menerbitkan versi baru.')
      + (can('vm') ? `<div class="row" style="margin-bottom:16px"><button class="btn" data-a="legal">${ic('stamp')}Serahkan ke Legal</button></div>
      <details class="more"><summary>Catat tanggapan dari kanal lain</summary><div style="margin-top:12px"><div class="field"><label for="fb-isi">Isi tanggapan</label><textarea class="input" id="fb-isi" placeholder="Misal tanggapan lewat telepon atau WhatsApp"></textarea></div>
      <label class="row small" style="margin-bottom:12px"><input type="checkbox" id="fb-setuju"> Mitra setuju tanpa catatan</label><button class="btn ghost" data-a="fb">Catat tanggapan</button></div></details>` : '');
  } else if (p.tahap === 3) {
    html = can('legal')
      ? head('Tugas Legal', 'Terbitkan nomor surat', `Nomor dicetak otomatis pada kolom No. di halaman pertama dokumen. Tenggat ${tgl(p.tenggat)}.`)
        + `<div class="field"><label for="no">Nomor surat</label><input class="input" id="no" placeholder="Contoh: 001/PKS/IJE/XI/2026"></div><button class="btn" data-a="nomor">Terbitkan nomor</button>`
      : head('Di Legal', 'Menunggu nomor surat dari Legal', `Tenggat ${tgl(p.tenggat)}.`);
  } else if (p.tahap === 4) {
    html = head('Langkah berikutnya', 'Bagikan perjanjian bernomor ke mitra', `Mitra menerima PDF No. ${esc(p.nomor_surat)} dan tautan untuk mengunggah tanda tangan.`)
      + (can('vm') ? `<button class="btn" data-a="bagikan">${ic('send')}Bagikan ke mitra</button>` : '');
  } else if (p.tahap === 5) {
    const rev = p.dokumen.find((d) => d.jenis === 'ttd_mitra' && d.status === 'menunggu_review');
    if (rev && can('vm')) {
      html = head('Perlu diperiksa', 'Periksa tanda tangan mitra', `Mitra mengunggah ${rev.penanda === 'scan_asli' ? 'scan dokumen lengkap' : 'tanda tangan yang ditempel ke dokumen'}. Pastikan tanda tangan, stempel, dan meterai terlihat jelas.`)
        + `<iframe class="pdf-frame" data-pdf="${rev.id}" title="Dokumen bertanda tangan mitra"></iframe>
        <div class="row" style="margin-top:14px"><button class="btn ok" data-a="setujui">${ic('check')}Setujui tanda tangan</button></div>
        <div class="field" style="margin-top:16px"><label for="alasan">Alasan bila diminta unggah ulang</label><textarea class="input" id="alasan" placeholder="Misal: meterai tidak terlihat jelas"></textarea></div><button class="btn danger" data-a="tolak">Minta unggah ulang</button>`;
    } else {
      html = head('Menunggu mitra', 'Menunggu tanda tangan mitra', `Batas unggah ${tgl(p.tenggat)}. Pengingat dikirim otomatis H-3, H-0, dan saat lewat tenggat.`)
        + (can('vm') ? `<details class="more"><summary>Unggah atas nama mitra</summary><div style="margin-top:12px" data-ttd="mitra"></div></details>` : '');
    }
  } else if (p.tahap === 6) {
    html = (S.me.penandatangan || S.me.peran === 'admin')
      ? head('Langkah terakhir', 'Tanda tangan PT IJE', 'Setelah disimpan, dokumen final dikunci, diarsipkan, dan salinannya dikirim ke mitra.')
        + `<div class="row" style="margin-bottom:14px"><div class="field" style="margin:0"><label for="ef">Tanggal efektif</label><input class="input" id="ef" type="date" value="${new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)}"></div>
          <div class="field" style="margin:0"><label for="masa">Masa berlaku (bulan)</label><input class="input" id="masa" type="number" min="1" max="120" value="${S.meta.jenis.find((j) => j.kode === p.jenis)?.masa_bulan || 12}"></div></div><div data-ttd="ije"></div>`
      : head('Menunggu', 'Menunggu tanda tangan PT IJE', 'Penandatangan berwenang PT IJE akan menyelesaikan tahap ini.');
  } else if (p.tahap === 7) {
    const fin = p.dokumen.find((d) => d.jenis === 'final');
    html = head('Selesai', 'Perjanjian ditandatangani kedua pihak', `Berlaku ${tgl(p.tgl_efektif)} sampai ${tgl(p.tgl_berakhir)}. Pengingat perpanjangan dikirim H-90, H-60, dan H-30.`)
      + (fin ? `<a class="btn" href="#" data-dok="${fin.id}">${ic('download')}Unduh dokumen final</a>` : '');
  }
  if (can('vm') && p.status !== 'batal' && p.tahap < 7 && p.tahap > 0) {
    html += `<details class="more" style="margin-top:20px;padding-top:14px;border-top:1px solid var(--line)"><summary>Koreksi alur</summary><div style="margin-top:12px">
      <div class="row"><div class="field" style="flex:1;margin:0"><label for="ke">Kembalikan ke tahap</label><select class="input" id="ke">${S.meta.tahap.filter((t) => t.n < p.tahap).map((t) => `<option value="${t.n}">${esc(t.nama)}</option>`).join('')}</select></div></div>
      <div class="field" style="margin-top:10px"><label for="kor">Alasan</label><textarea class="input" id="kor" placeholder="Wajib diisi, tercatat di jejak audit"></textarea></div>
      <div class="row"><button class="btn ghost" data-a="mundur">Kembalikan tahap</button><button class="btn danger" data-a="batal">Batalkan perjanjian</button></div></div></details>`;
  }
  box.innerHTML = html;
  $$('iframe[data-pdf]', box).forEach(async (fr) => { try { const b = await api(`/api/dokumen/${fr.dataset.pdf}`); fr.src = URL.createObjectURL(b) + '#page=999&view=FitH'; } catch (e) { toast(e.message, true); } });

  doIt('[data-a="kirim"]', () => post(`/api/perjanjian/${p.id}/kirim`), 'Dokumen dikirim ke mitra');
  doIt('[data-a="legal"]', () => post(`/api/perjanjian/${p.id}/legal`), 'Diserahkan ke Legal');
  doIt('[data-a="fb"]', () => post(`/api/perjanjian/${p.id}/feedback`, { isi: $('#fb-isi').value, setuju: $('#fb-setuju').checked }), 'Tanggapan dicatat');
  doIt('[data-a="nomor"]', () => { const fd = new FormData(); fd.set('nomor_surat', $('#no').value); return postForm(`/api/perjanjian/${p.id}/nomor`, fd); }, 'Nomor surat terbit');
  doIt('[data-a="bagikan"]', () => post(`/api/perjanjian/${p.id}/bagikan`), 'Perjanjian dibagikan ke mitra');
  doIt('[data-a="setujui"]', () => post(`/api/perjanjian/${p.id}/ttd-mitra/review`, { setuju: true }), 'Tanda tangan mitra disetujui');
  doIt('[data-a="tolak"]', () => post(`/api/perjanjian/${p.id}/ttd-mitra/review`, { setuju: false, alasan: $('#alasan').value }), 'Permintaan unggah ulang dikirim');
  doIt('[data-a="mundur"]', () => post(`/api/perjanjian/${p.id}/mundur`, { ke: $('#ke').value, alasan: $('#kor').value }), 'Tahap dikembalikan');
  doIt('[data-a="batal"]', () => post(`/api/perjanjian/${p.id}/batal`, { alasan: $('#kor').value }), 'Perjanjian dibatalkan');

  const ttdBox = box.querySelector('[data-ttd]');
  if (ttdBox) {
    const pihak = ttdBox.dataset.ttd;
    const submitUrl = pihak === 'ije' ? `/api/perjanjian/${p.id}/ttd-ije` : `/api/perjanjian/${p.id}/ttd-mitra`;
    const extra = (fd) => { if (pihak === 'ije') { fd.set('tgl_efektif', $('#ef').value); fd.set('masa_bulan', $('#masa').value); } return fd; };
    ttdBox.innerHTML = `<div class="seg-toggle" role="group" aria-label="Opsi tanda tangan" style="margin-bottom:14px"><button aria-pressed="true" data-o="1">Opsi 1: TTD langsung</button><button aria-pressed="false" data-o="2">Opsi 2: Unggah dokumen penuh</button></div><div data-o-body></div>`;
    const body = $('[data-o-body]', ttdBox);
    const show = (o) => {
      $$('[data-o]', ttdBox).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.o === o)));
      if (o === '1') {
        mountTtdWidget(body, {
          confirmLabel: pihak === 'ije' ? 'Tanda tangani dan selesaikan' : 'Simpan tanda tangan mitra',
          onPreview: (png) => { const fd = new FormData(); fd.set('pihak', pihak); fd.set('berkas', png, 'ttd.png'); return postForm(`/api/perjanjian/${p.id}/pratinjau-ttd`, fd); },
          onConfirm: async (png) => { const fd = extra(new FormData()); fd.set('opsi', '1'); fd.set('berkas', png, 'ttd.png'); await postForm(submitUrl, fd); toast(pihak === 'ije' ? 'Perjanjian selesai dan diarsipkan' : 'Tanda tangan mitra disimpan'); reload(); },
        });
      } else {
        body.innerHTML = `<div class="field"><label for="full">Scan dokumen lengkap yang sudah ditandatangani (PDF)</label><input class="input" id="full" type="file" accept="application/pdf"><span class="hint">Semua halaman harus ikut dipindai. Jumlah halaman dicocokkan dengan dokumen bernomor.</span></div><button class="btn" data-full>${pihak === 'ije' ? 'Unggah dan selesaikan' : 'Unggah scan mitra'}</button>`;
        $('[data-full]', body).addEventListener('click', (e) => busy(e.currentTarget, async () => {
          const f = $('#full', body).files[0]; if (!f) throw new Error('Pilih berkas PDF');
          const fd = extra(new FormData()); fd.set('opsi', '2'); fd.set('berkas', f);
          await postForm(submitUrl, fd); toast(pihak === 'ije' ? 'Perjanjian selesai dan diarsipkan' : 'Scan mitra disimpan'); reload();
        }));
      }
    };
    $$('[data-o]', ttdBox).forEach((b) => b.addEventListener('click', () => show(b.dataset.o)));
    show('1');
  }
}

// ---------- Mitra ----------
async function pageMitra(params) {
  const mode = params.get('semua') ? 'semua' : 'batch';
  const q = params.get('q') || '';
  const list = await api(mode === 'batch' && !q ? '/api/mitra?batch=1' : `/api/mitra?q=${encodeURIComponent(q)}`);
  const kosong = list.filter((m) => !m.emails.length).length;
  app.innerHTML = `${topbar('Mitra', `${list.length} mitra${mode === 'batch' && !q ? ' pada batch awal' : ''}. Sumber: info perseroan.`)}
    ${kosong ? `<div class="notice" style="margin-bottom:16px">${kosong} mitra belum punya email di info perseroan dan belum bisa menerima dokumen.</div>` : ''}
    <div class="card"><div class="card-head" style="flex-wrap:wrap">
      <div class="seg-toggle" role="group" aria-label="Cakupan"><button aria-pressed="${mode === 'batch' && !q}" data-m="batch">Batch awal</button><button aria-pressed="${mode === 'semua' || !!q}" data-m="semua">Semua mitra</button></div>
      <form class="search" data-ms style="width:min(340px,100%)">${ic('search')}<label class="sr" for="mq">Cari mitra</label><input id="mq" value="${esc(q)}" placeholder="Cari nama mitra"></form></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Perusahaan</th><th>Jenis</th><th>Status</th><th>Email</th><th>Perjanjian</th><th></th></tr></thead><tbody>
      ${list.map((m, i) => `<tr data-i="${i}"><td><div class="cell-main">${esc(m.nama)}</div><div class="cell-sub">${esc(m.direksi || '')}</div></td><td>${esc(m.jenis || '–')}</td><td><span class="chip ${m.status === 'Aktif' ? 'c-ok' : 'c-idle'}">${esc(m.status)}</span></td>
        <td>${m.emails.length ? `<span class="cell-sub">${esc(m.emails[0])}${m.emails.length > 1 ? ` +${m.emails.length - 1}` : ''}</span>` : '<span class="chip c-late">Kosong</span>'}</td><td class="num">${m.perjanjian}</td>
        <td>${can('vm') ? `<button class="btn ghost sm" data-c="${i}">${ic('plus')}Perjanjian</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div></div>`;
  bindSearch();
  $$('[data-m]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.m === 'semua' ? '#/mitra?semua=1' : '#/mitra'; }));
  $('[data-ms]').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#mq').value.trim(); location.hash = v ? `#/mitra?semua=1&q=${encodeURIComponent(v)}` : '#/mitra'; });
  $$('[data-c]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openCreate(list[b.dataset.c]); }));
  $$('tr[data-i]').forEach((tr) => tr.addEventListener('click', () => openMitra(list[tr.dataset.i].row)));
}

async function openMitra(row) {
  const m = await api(`/api/mitra/${row}`);
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<div class="dh"><h2>${esc(m.nama)}</h2><button class="icon-btn" aria-label="Tutup" data-x>✕</button></div><div class="db">
    <dl class="kv"><dt>Nama singkat</dt><dd>${esc(m.singkat)}</dd><dt>Jenis</dt><dd>${esc(m.jenis || '–')}</dd><dt>Status</dt><dd>${esc(m.status)}</dd><dt>Direksi</dt><dd>${esc(m.direksi || '–')}</dd><dt>Alamat</dt><dd>${esc(m.alamat || '–')}</dd><dt>Telepon</dt><dd>${esc(m.telepon || '–')}</dd><dt>Email</dt><dd>${m.emails.map(esc).join('<br>') || '<span style="color:var(--late)">Kosong</span>'}</dd></dl>
    <h3 style="margin:18px 0 8px">Perjanjian</h3>${m.perjanjian.length ? `<ul class="list">${m.perjanjian.map((p) => `<li style="grid-template-columns:minmax(0,1fr) auto"><a href="#/perjanjian/${p.id}" data-x style="min-width:0"><div class="t">${esc(p.judul)}</div><div class="s">${esc(p.nomor_surat || p.kode)}, ${esc(tahapNama(p.tahap))}</div></a>${chipTampil(p.tampil)}</li>`).join('')}</ul>` : '<div class="empty">Belum ada perjanjian</div>'}
    <p class="small muted">Data perusahaan diubah di tabel mitra (info perseroan), bukan di Starlite.</p></div>
    <div class="df">${can('vm') ? `<button class="btn" data-n>${ic('plus')}Perjanjian baru</button>` : ''}</div>`;
  document.body.append(dlg); dlg.showModal();
  dlg.addEventListener('close', () => dlg.remove());
  $$('[data-x]', dlg).forEach((x) => x.addEventListener('click', () => dlg.close()));
  $('[data-n]', dlg)?.addEventListener('click', () => { dlg.close(); openCreate(m); });
}

// ---------- Pengaturan ----------
async function pagePengaturan() {
  if (!can()) { location.hash = '#/'; return; }
  const d = await api('/api/admin');
  const k = Object.fromEntries(d.konfig.map((x) => [x.k, x.v]));
  const sla = JSON.parse(k.sla_hari_kerja || '{}');
  app.innerHTML = `${topbar('Pengaturan', 'Pengguna, tenggat, nomor surat, dan posisi tanda tangan.')}
    <div class="grid" style="grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);align-items:start">
      <div class="card"><div class="card-head"><h2>Pengguna</h2></div>
        <div class="table-wrap"><table class="t"><thead><tr><th>Nama</th><th>Peran</th><th>Penandatangan</th><th>Status</th></tr></thead><tbody>
        ${d.pengguna.map((u, i) => `<tr data-u="${i}"><td><div class="cell-main">${esc(u.nama)}</div><div class="cell-sub">${esc(u.email)}</div></td><td style="text-transform:capitalize">${esc(u.peran === 'vm' ? 'Vendor Management' : u.peran)}</td><td>${u.penandatangan ? 'Ya' : '–'}</td><td>${u.aktif ? '<span class="chip c-ok">Aktif</span>' : '<span class="chip c-idle">Nonaktif</span>'}</td></tr>`).join('')}</tbody></table></div>
        <form data-uf style="margin-top:18px;padding-top:16px;border-top:1px solid var(--line)"><h3 style="margin-bottom:12px">Tambah atau ubah pengguna</h3>
          <div class="row"><div class="field" style="flex:1"><label for="u-email">Email</label><input class="input" id="u-email" name="email" type="email" required placeholder="nama@pmosurge.co.id"></div><div class="field" style="flex:1"><label for="u-nama">Nama</label><input class="input" id="u-nama" name="nama" required></div></div>
          <div class="row"><div class="field" style="flex:1"><label for="u-peran">Peran</label><select class="input" id="u-peran" name="peran"><option value="vm">Vendor Management</option><option value="legal">Legal</option><option value="manajemen">Manajemen</option><option value="admin">Admin</option></select></div>
            <label class="row small"><input type="checkbox" name="penandatangan"> Penandatangan PT IJE</label><label class="row small"><input type="checkbox" name="aktif" checked> Aktif</label></div>
          <div class="df"><button class="btn">Simpan pengguna</button><button class="btn ghost" type="button" data-reset>Reset password</button></div>
          <p class="small muted" style="margin-bottom:0">Pengguna baru mendapat password sementara yang tampil sekali.</p></form></div>
      <div class="stack">
        <div class="card"><h2 style="margin-bottom:12px">Tenggat per tahap</h2><p class="small muted" style="margin-top:0">Dalam hari kerja (Senin–Jumat).</p>
          ${[1, 2, 3, 4, 5, 6].map((n) => `<div class="row" style="justify-content:space-between;margin-bottom:8px"><label for="sla${n}">${esc(tahapNama(n))}</label><input class="input num" id="sla${n}" type="number" min="1" max="60" value="${sla[n] ?? ''}" style="width:90px"></div>`).join('')}
          <div class="field" style="margin-top:14px"><label for="fmt">Pola nomor surat</label><input class="input" id="fmt" value="${esc(k.format_nomor)}"><span class="hint">Ekspresi reguler. Contoh: ^\\d{3}/PKS/IJE/[IVX]+/\\d{4}$</span></div>
          <div class="field"><label for="tok">Masa berlaku tautan mitra (hari)</label><input class="input" id="tok" type="number" min="1" max="90" value="${esc(k.token_hari)}"></div>
          <button class="btn" data-k>Simpan pengaturan</button></div>
        ${d.jenis.map((j, i) => { const pos = JSON.parse(j.posisi_ttd); const f = (pk, nm, lbl) => `<div class="field" style="margin:0"><label for="j${i}${pk}${nm}">${lbl}</label><input class="input num" id="j${i}${pk}${nm}" type="number" value="${pos[pk][nm]}"></div>`; return `
        <div class="card" data-j="${i}"><h2 style="margin-bottom:6px">${esc(j.nama)}</h2><p class="small muted" style="margin-top:0">Posisi tempel TTD (opsi 1) dalam point PDF dari kiri-bawah. Halaman -1 berarti halaman terakhir.</p>
          <div class="field"><label for="j${i}masa">Masa berlaku bawaan (bulan)</label><input class="input num" id="j${i}masa" type="number" value="${j.masa_bulan}"></div>
          ${[['mitra', 'Mitra'], ['ije', 'PT IJE']].map(([pk, lbl]) => `<h3 style="margin:10px 0 8px">${lbl}</h3><div class="grid" style="grid-template-columns:repeat(4,1fr);gap:8px">${f(pk, 'page', 'Halaman')}${f(pk, 'x', 'X')}${f(pk, 'y', 'Y')}${f(pk, 'w', 'Lebar')}</div>`).join('')}
          <button class="btn" style="margin-top:14px" data-js="${i}">Simpan posisi</button></div>`; }).join('')}
      </div></div>`;
  bindSearch();
  const uf = $('[data-uf]');
  $$('tr[data-u]').forEach((tr) => tr.addEventListener('click', () => { const u = d.pengguna[tr.dataset.u]; uf.email.value = u.email; uf.nama.value = u.nama; uf.peran.value = u.peran; uf.penandatangan.checked = !!u.penandatangan; uf.aktif.checked = !!u.aktif; uf.nama.focus(); }));
  uf.addEventListener('submit', (e) => { e.preventDefault(); busy(e.submitter, async () => { const r = await post('/api/admin/pengguna', { email: uf.email.value, nama: uf.nama.value, peran: uf.peran.value, penandatangan: uf.penandatangan.checked, aktif: uf.aktif.checked }); toast('Pengguna disimpan'); await pagePengaturan(); if (r.password_awal) tampilkanPassword(uf.email.value.trim().toLowerCase(), r.password_awal); }); });
  $('[data-reset]', uf).addEventListener('click', (e) => {
    const em = uf.email.value.trim().toLowerCase();
    if (!d.pengguna.some((u) => u.email === em)) { toast('Pilih pengguna yang sudah ada dari daftar', true); return; }
    if (!confirm(`Reset password ${em}? Sesi aktifnya akan diakhiri.`)) return;
    busy(e.currentTarget, async () => { const r = await post('/api/admin/pengguna/reset', { email: em }); tampilkanPassword(em, r.password_awal); });
  });
  $('[data-k]').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const s = {}; [1, 2, 3, 4, 5, 6].forEach((n) => { const v = Number($(`#sla${n}`).value); if (v) s[n] = v; });
    await post('/api/admin/konfig', { sla_hari_kerja: JSON.stringify(s), format_nomor: $('#fmt').value, token_hari: $('#tok').value }); toast('Pengaturan disimpan');
  }));
  $$('[data-js]').forEach((b) => b.addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const i = b.dataset.js, j = d.jenis[i], num = (id) => Number($(`#j${i}${id}`).value);
    const pos = Object.fromEntries(['mitra', 'ije'].map((pk) => [pk, { page: num(pk + 'page'), x: num(pk + 'x'), y: num(pk + 'y'), w: num(pk + 'w') }]));
    await post('/api/admin/jenis', { kode: j.kode, nama: j.nama, masa_bulan: num('masa'), posisi_ttd: pos }); toast('Posisi tanda tangan disimpan');
  })));
}

// ---------- Router ----------
async function route() {
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  const params = new URLSearchParams(qs || '');
  const parts = path.split('/').filter(Boolean);
  const key = parts[0] || 'home';
  renderNav(key);
  // Konten lama tetap tampil (meredup) selama data dimuat; kerangka muncul hanya bila lambat. Lalu konten baru masuk halus.
  const nomorRute = (route.n = (route.n || 0) + 1);
  app.classList.remove('masuk'); app.classList.add('memuat');
  const lambat = setTimeout(() => { if (route.n === nomorRute) app.innerHTML = '<div class="skeleton"></div>'; }, 350);
  try {
    if (key === 'home') await pageDashboard();
    else if (key === 'perjanjian' && parts[1]) await pageDetail(parts[1]);
    else if (key === 'perjanjian') await pagePerjanjian(params);
    else if (key === 'mitra') await pageMitra(params);
    else if (key === 'pengaturan') await pagePengaturan();
    else app.innerHTML = `<div class="empty"><b>Halaman tidak ditemukan</b><a href="#/">Kembali ke ringkasan</a></div>`;
  } catch (e) {
    app.innerHTML = `<div class="card"><div class="empty"><b>Halaman gagal dimuat</b>${esc(e.message)}<div style="margin-top:12px"><button class="btn ghost" onclick="location.reload()">Muat ulang</button></div></div></div>`;
  }
  clearTimeout(lambat);
  if (route.n !== nomorRute) return;
  app.classList.remove('memuat');
  void app.offsetWidth; app.classList.add('masuk');
  app.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

// Dokumen diambil lewat API (butuh token), lalu dibuka di tab baru.
document.addEventListener('click', async (e) => {
  const a = e.target.closest('[data-dok]');
  if (!a) return;
  e.preventDefault();
  const w = window.open('', '_blank');
  try { const b = await api(`/api/dokumen/${a.dataset.dok}`); const u = URL.createObjectURL(b); if (w) w.location = u; else location.href = u; }
  catch (ex) { w?.close(); toast(ex.message, true); }
});

async function mulai() {
  try {
    S.me = await api('/api/me');
  } catch (e) {
    if (e.status === 401) { showLogin(); return; }
    app.innerHTML = `<div class="card" style="max-width:520px;margin:10vh auto"><div class="empty"><b>Tidak dapat memuat Starlite</b>${esc(e.message)}</div></div>`;
    return;
  }
  if (S.me.wajib_ganti) { layarGanti(); return; }
  S.meta = await api('/api/meta');
  shell(true);
  if (!mulai.terikat) { window.addEventListener('hashchange', () => S.me && route()); mulai.terikat = true; }
  route();
}
mulai();
