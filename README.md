# 🎨 Artifact Visualizer v3 — WhatsApp Edition

> Generate visualisasi data interaktif dari MySQL/Supabase/Firebase/CSV,
> lalu kirim link-nya otomatis ke WhatsApp — powered by DeepSeek AI + Baileys (free).

---

## 🏗 Arsitektur

```
Pengguna WA
    ↕  kirim !viz prompt
Baileys (Vercel)  ←──── @whiskeysockets/baileys (FREE, no API fees)
    ↕  POST /api/wa/generate + source config
PHP Server (artifact-visualizer.php)
    ↕  call DeepSeek AI
    ├─ Schema Inspector → Query Planner → Execute → Artifact Builder
    ↕  save HTML ke viz_cache/
    └─ return viz_url
Vercel Bridge  ──→  kirim link viz ke pengguna WA
```

---

## 📦 Struktur File

```
artifact-visualizer-v3/
├── artifact-visualizer.php   ← PHP server utama (web UI + WA API)
├── viz_cache/                ← HTML artifacts tersimpan di sini (auto-created)
├── .env.example              ← template env vars
└── wa-bridge/                ← Vercel serverless bridge
    ├── api/
    │   ├── qr.js             ← GET /api/qr → tampil QR untuk scan WA
    │   ├── status.js         ← GET /api/status → cek status koneksi
    │   └── send.js           ← POST /api/send → kirim pesan/link ke WA
    ├── lib/
    │   ├── session.js        ← Baileys session manager
    │   └── handler.js        ← Parser perintah WA (!viz, !connect, dll)
    ├── package.json
    └── vercel.json
```

---

## 🚀 Cara Deploy

### Step 1 — PHP Server

1. Upload `artifact-visualizer.php` ke web hosting PHP 8.1+
2. Buat folder `viz_cache/` di direktori yang sama:
   ```bash
   mkdir viz_cache && chmod 755 viz_cache
   ```
3. Set environment variables (`.htaccess` atau panel hosting):
   ```apache
   SetEnv DEEPSEEK_API_KEY    sk-xxxxxxxxxxxxxx
   SetEnv VIZ_BASE_URL        https://yourserver.com
   SetEnv WA_BRIDGE_URL       https://your-bridge.vercel.app
   SetEnv BRIDGE_SECRET       random-secret-string-yang-panjang
   ```

### Step 2 — Vercel WA Bridge

```bash
cd wa-bridge/
npm install

# Install Vercel CLI jika belum
npm i -g vercel

# Login dan deploy
vercel login
vercel

# Set env vars
vercel env add PHP_SERVER_URL    # https://yourserver.com/artifact-visualizer.php
vercel env add BRIDGE_SECRET     # harus sama dengan di PHP server

# Deploy ke production
vercel --prod
```

### Step 3 — Pairing WhatsApp

1. Buka: `https://your-bridge.vercel.app/api/qr`
2. Scan QR dengan WhatsApp di HP kamu:
   - **Menu** → **Perangkat Tertaut** → **Tautkan Perangkat**
3. Setelah terhubung, kirim `!help` ke nomor bot

---

## 📱 Perintah WhatsApp

| Perintah | Deskripsi |
|----------|-----------|
| `!help` | Tampilkan daftar perintah |
| `!connect mysql host db user pass [port]` | Sambungkan ke MySQL |
| `!connect supabase url anon_key` | Sambungkan ke Supabase |
| `!connect firebase project_id api_key` | Sambungkan ke Firebase |
| `!connect file /path/file.csv` | Gunakan file CSV/JSON |
| `!viz <prompt>` | Generate visualisasi |
| `!ds` | Lihat datasource aktif |
| `!status` | Status bridge |

### Contoh Penggunaan

```
Kamu: !connect mysql localhost mydb root secret123

Bot: ✅ Terhubung ke MYSQL!
     Schema preview:
     {"orders": ["id INT PK", "total DECIMAL", ...], ...}
     
     Sekarang kirim: !viz <prompt_kamu>

Kamu: !viz tampilkan total penjualan per bulan tahun ini, buat grafik tren

Bot: ⚡ Memproses...
     AI sedang inspect schema → plan query → execute → build viz...

Bot: ✅ Artifact siap!
     📊 Data: 12 baris
     🧠 Token AI: 4,821
     🔍 Query: SELECT DATE_FORMAT(created_at, '%Y-%m')...
     
     🔗 Link Visualisasi:
     https://yourserver.com/viz_cache/a3f8b2c1.html?wa_share=true
```

---

## ⚙️ Konfigurasi Advanced

### Persist Sesi WA di Vercel (Opsional)

Secara default sesi Baileys disimpan di `/tmp` dan akan reset saat cold start. Untuk sesi permanen, gunakan [Vercel KV](https://vercel.com/docs/storage/vercel-kv):

1. Tambah Vercel KV ke project kamu
2. Set env `VERCEL_KV_REST_API_URL` dan `VERCEL_KV_REST_API_TOKEN`
3. Modifikasi `lib/session.js` untuk menggunakan KV store

### Cleanup viz_cache

Artifact HTML tersimpan selamanya. Untuk auto-cleanup, tambah cron job:
```bash
# Hapus artifact > 30 hari
find /path/to/viz_cache -name "*.html" -mtime +30 -delete
```

---

## 🔒 Keamanan

- **BRIDGE_SECRET**: Selalu ganti dari default. Gunakan string random 32+ karakter.
- **SQL Safety**: Hanya `SELECT` yang diizinkan. Tabel sistem diblokir otomatis.
- **File Upload**: Hanya `.csv` dan `.json` yang diizinkan.
- **WA Session**: Simpan session dengan aman, jangan di-commit ke Git.

---

## 📚 Dependencies

| Komponen | Library | Lisensi |
|----------|---------|---------|
| WA Client | `@whiskeysockets/baileys` | MIT (FREE) |
| QR Generator | `qrcode` | MIT |
| HTTP Client | `axios` | MIT |
| Logger | `pino` | MIT |
| AI | DeepSeek API | Commercial |
| Runtime | PHP 8.1+ | PHP License |
| Hosting | Vercel Free Tier | Vercel ToS |

---

## ❓ FAQ

**Q: Apakah Baileys legal?**  
A: Baileys adalah reverse-engineered client. Penggunaan untuk bot pribadi umumnya diterima, tapi perhatikan ToS WhatsApp. Jangan gunakan untuk spam.

**Q: Berapa biaya?**  
A: Gratis! Vercel free tier cukup untuk penggunaan personal. DeepSeek API berbayar per token (sangat murah ~$0.14/1M token).

**Q: Apakah bisa pakai nomor WA biasa (non-Business)?**  
A: Ya, Baileys mendukung WhatsApp regular maupun Business.
