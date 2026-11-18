#!/usr/bin/env bash
# Reset database lokal untuk pengujian (tidak menyentuh database Cloudflare).
set -e
rm -rf .wrangler/state
npx wrangler d1 migrations apply starlite-pks --local >/dev/null
npx wrangler d1 execute starlite-vm --local --file scripts/seed-vm-local.sql >/dev/null
npx wrangler d1 execute starlite-pks --local --command "INSERT INTO pks_pengguna (email,nama,peran) VALUES ('legal.uji@pmosurge.co.id','Legal Uji','legal'),('direksi.uji@pmosurge.co.id','Manajemen Uji','manajemen')" >/dev/null
echo "DB lokal siap"
