# Starlite — Pemantauan Perjanjian Kerja Sama Mitra

Aplikasi Vendor Management PT Integrasi Jaringan Ekosistem untuk memantau perjanjian jasa kerja sama dengan mitra, dari pengiriman dokumen sampai arsip final.

## Alur

| Tahap | Proses | Aktor |
|---|---|---|
| 0 | Buat perjanjian dari data info perseroan + unggah dokumen (dikunci) | VM |
| 1 | Kirim email otomatis ke mitra (lampiran + tautan portal) | Sistem |
| 2 | Tanggapan mitra via portal atau balasan email (ditangkap otomatis) | Mitra |
| 3 | Serahkan ke Legal | VM |
| 4 | Legal mengisi nomor surat + unggah PDF bernomor | Legal |
| 5 | Bagikan kembali ke mitra | Sistem |
| 6 | TTD mitra: opsi 1 (unggah TTD+stempel+meterai, ditempel otomatis) atau opsi 2 (scan dokumen penuh), diperiksa VM | Mitra / VM |
| 7 | TTD PT IJE (opsi 1/2), dokumen final dikunci dan dikirim ke mitra | Penandatangan |
| 8 | Pengingat masa berlaku H-90/60/30 | Sistem |

## Arsitektur

- **Cloudflare Workers** (`src/`) — API (Hono) + aset statis (`public/`) + cron 15 menit (pengingat, balasan email).
- **D1 `starlite-pks`** — seluruh data Starlite (tabel `pks_*`). Migrasi di `migrations/`.
- **D1 `starlite-vm`** — hanya **dibaca**, khusus tabel `mitra` (info perseroan). Kode menolak perintah selain `SELECT` ke database ini.
- **Apps Script Web App** (`apps-script/Starlite.gs`) — jembatan ke Google di akun `vendor.management@weave.co.id`: berkas ke Google Drive (`{Mitra}/{Kode}/{01 Master … 05 Final}` di bawah folder induk) dan email lewat Gmail; balasan mitra dibaca per thread.
- **Login** — email + password di tabel `pks_pengguna` (D1 `starlite-pks`), hash PBKDF2-SHA256, sesi cookie HttpOnly (token di-hash di `pks_sesi`), kunci akun 15 menit setelah 5 kali gagal. Tanpa Cloudflare Access.

Integritas: setiap berkas dicatat SHA-256; metadata dokumen dan audit log dikunci trigger database; berkas yang berubah di luar aplikasi ditandai "tidak sesuai".

## Menjalankan lokal

```bash
npm install
cp .dev.vars.example .dev.vars
./scripts/reset-local.sh      # DB lokal + data uji (tidak menyentuh Cloudflare)
npx wrangler dev              # http://127.0.0.1:8787
node scripts/demo.mjs         # opsional: data demo semua tahap
```

Mode dev: email disimulasikan dan berkas disimpan di tabel `pks_blob` (maks 1,9 MB). Semua pengguna uji berpassword `Uji-Starlite-2026`.

## Pengujian

```bash
npm test                      # unit + jembatan Apps Script (16)
node test/e2e.mjs             # alur penuh API + keamanan + login (77), butuh wrangler dev
node test/ui.mjs              # UI di Chrome nyata (27), butuh wrangler dev + Chrome
```

## Deploy

1. **Paket Workers berbayar disarankan** ($5/bulan). Penempelan TTD pada PDF butuh waktu CPU melebihi batas paket gratis.
2. **Apps Script** (login sebagai `vendor.management@weave.co.id`):
   1. script.google.com → Project baru → tempel isi `apps-script/Starlite.gs` (satu file saja). Pilih fungsi `izinkan` → Run → setujui izin Gmail dan Drive.
   2. Project Settings → Script properties → tambah `KEY` = kunci acak panjang (mis. 40 karakter).
   3. Deploy → New deployment → Web app: *Execute as* **Me**, *Who has access* **Anyone**. Salin URL `/exec`.
   4. Pastikan akun itu Editor di folder Drive induk (`DRIVE_ROOT_FOLDER`).
   5. Setiap mengubah kode `.gs`: Deploy → Manage deployments → Edit → Version baru (URL tetap).
3. Secret Worker:
   ```bash
   npx wrangler secret put APPS_SCRIPT_URL      # URL /exec
   npx wrangler secret put APPS_SCRIPT_KEY      # sama dengan properti KEY
   npx wrangler secret put ADMIN_PASSWORD_AWAL  # password masuk pertama admin (wajib diganti saat masuk)
   ```
4. Terapkan migrasi login ke `starlite-pks`: jalankan isi `migrations/0002_login.sql` di Console D1 (0001 sudah diterapkan lewat Console, jadi jangan pakai `migrations apply`).
5. Isi `APP_URL` di `wrangler.toml`, lalu `npx wrangler deploy` (atau push ke `main` → GitHub Actions, butuh secret `CLOUDFLARE_API_TOKEN` dan `CLOUDFLARE_ACCOUNT_ID`).
6. Masuk dengan email admin + `ADMIN_PASSWORD_AWAL`, ganti password, lalu tambah pengguna di Pengaturan (password sementara tampil sekali). Disarankan menambah aturan *Rate limiting* Cloudflare untuk `/api/login`.

## Pengguna

Admin awal tersimpan di migrasi 0001 sebagai `vendormanagement@pmosurge.co.id`; ganti ke email yang dipakai: `UPDATE pks_pengguna SET email='<email-baru>' WHERE email='vendormanagement@pmosurge.co.id';` (jalankan sebelum masuk pertama). Tambahkan VM, Legal, Manajemen, dan penandatangan di menu Pengaturan.

## Antarmuka di GitHub Pages

Antarmuka (`public/`) disajikan di `https://vmstarlite-apps.github.io/Perjanjian-kerja-sama/` oleh `.github/workflows/pages.yml`. Data, login, email, dan Drive tetap lewat API Worker (`APP_URL`).

- Login dari Pages memakai token sesi di header `Authorization` (tanpa cookie lintas situs), disimpan di `sessionStorage`.
- `CORS_ORIGIN` di `wrangler.toml` menentukan origin yang boleh memanggil API; `UI_URL` dipakai untuk tautan internal di email.
- Portal mitra (`/portal.html`) tetap di Worker.
- Pengaturan satu kali: repo → Settings → Pages → Source: **GitHub Actions** (repo harus Public pada akun gratis).
- Mengganti alamat Worker: ubah `API_URL` di `pages.yml`.
