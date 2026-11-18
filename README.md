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
- **Google Drive** — penyimpanan berkas, folder `{Mitra}/{Kode}/{01 Master … 05 Final}` di bawah folder induk.
- **Gmail API** — email dari akun Vendor Management, balasan dibaca per thread.
- **Cloudflare Access** — login Google domain perusahaan; JWT diverifikasi di Worker.

Integritas: setiap berkas dicatat SHA-256; metadata dokumen dan audit log dikunci trigger database; berkas yang berubah di luar aplikasi ditandai "tidak sesuai".

## Menjalankan lokal

```bash
npm install
cp .dev.vars.example .dev.vars
./scripts/reset-local.sh      # DB lokal + data uji (tidak menyentuh Cloudflare)
npx wrangler dev              # http://127.0.0.1:8787
node scripts/demo.mjs         # opsional: data demo semua tahap
```

Mode dev: email disimulasikan dan berkas disimpan di tabel `pks_blob` (maks 1,9 MB).

## Pengujian

```bash
npm test                      # unit (7)
node test/e2e.mjs             # alur penuh API + keamanan (54), butuh wrangler dev
node test/ui.mjs              # UI di Chrome nyata (22), butuh wrangler dev + Chrome
```

## Deploy

1. **Paket Workers berbayar disarankan** ($5/bulan). Penempelan TTD pada PDF butuh waktu CPU melebihi batas paket gratis.
2. Secret Worker:
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler secret put GOOGLE_REFRESH_TOKEN
   ```
   Refresh token dari akun `vendormanagement@pmosurge.co.id` dengan scope `https://www.googleapis.com/auth/drive`, `gmail.send`, `gmail.readonly`.
3. Isi `APP_URL`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` di `wrangler.toml`.
4. Cloudflare Access: aplikasi untuk domain Starlite (izinkan `@pmosurge.co.id`), plus kebijakan **Bypass** untuk portal mitra: `/portal.html`, `/portal.js`, `/ttd.js`, `/app.css`, `/logo.png`, `/favicon.png`, `/api/portal*`.
5. `npx wrangler deploy` — atau push ke `main` (GitHub Actions, butuh secret `CLOUDFLARE_API_TOKEN` dan `CLOUDFLARE_ACCOUNT_ID`).

Skema `starlite-pks` sudah diterapkan di Cloudflare (migrasi `0001_init.sql` tercatat di `d1_migrations`).

## Pengguna

Admin awal: `vendormanagement@pmosurge.co.id`. Tambahkan VM, Legal, Manajemen, dan penandatangan di menu Pengaturan.
