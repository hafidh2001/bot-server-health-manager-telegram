# 🤖 ServerBot — Telegram Server Health Manager

> Monitor, manage, dan kontrol server kamu langsung dari Telegram. Cek disk, memory, restart service, lihat log, bahkan jalankan CLI — semua tanpa buka terminal.

---

## 📋 Daftar Isi

- [Fitur](#-fitur)
- [Arsitektur](#-arsitektur)
- [Prasyarat](#-prasyarat)
- [Instalasi & Setup](#-instalasi--setup)
- [Konfigurasi](#-konfigurasi)
- [Menjalankan Bot](#-menjalankan-bot)
- [Panduan Penggunaan Bot](#-panduan-penggunaan-bot)
- [Keamanan](#-keamanan)
- [Troubleshooting](#-troubleshooting)
- [Struktur Project](#-struktur-project)

---

## ✨ Fitur

| Fitur | Deskripsi |
|-------|-----------|
| 🖥 **Multi-server** | Tambah dan kelola banyak server sekaligus |
| 📋 **Spesifikasi Server** | Tampilkan OS, CPU, kernel, arsitektur |
| 💾 **Disk Usage** | Lihat ukuran, usage, dan available tiap partisi |
| 🧠 **Memory Usage** | Monitor RAM dan Swap secara real-time |
| 🔧 **Service Manager** | Deteksi & restart PM2, Docker, Nginx, Systemd |
| 📜 **Log Viewer** | Lihat log Nginx, Docker, PM2, dan Journalctl |
| 💻 **CLI Mode** | Jalankan command langsung di server dari Telegram |
| 🔐 **Enkripsi Kredensial** | Password & SSH key dienkripsi sebelum disimpan |

---

## 🏗 Arsitektur

```
User (Telegram)
      │
      ▼
┌─────────────────────┐
│   Telegram Bot API  │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   Bot Server        │
│  (Telegraf.js)      │
│                     │
│  ┌───────────────┐  │
│  │ Handlers      │  │  ← Conversation flow, inline keyboard
│  ├───────────────┤  │
│  │ Services      │  │  ← Business logic, parser
│  ├───────────────┤  │
│  │ SSH Manager   │  │  ← Koneksi & eksekusi command
│  ├───────────────┤  │
│  │ Database      │  │  ← SQLite, simpan config server
│  └───────────────┘  │
└─────────┬───────────┘
          │  SSH
          ▼
┌─────────────────────┐
│   Server Target     │
│  (VPS / Bare Metal) │
└─────────────────────┘
```

---

## 🧰 Prasyarat

Pastikan environment kamu sudah memiliki:

- **Node.js** >= 18.x
- **npm** >= 9.x
- **Akun Telegram** dan bot token dari [@BotFather](https://t.me/BotFather)
- Server target yang bisa diakses via **SSH**
- (Opsional) **SQLite3** CLI untuk debug database

---

## 🚀 Instalasi & Setup

### 1. Clone Repository

```bash
git clone https://github.com/username/serverbot.git
cd serverbot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Buat File Environment

```bash
cp .env.example .env
```

Edit file `.env` sesuai konfigurasi kamu (lihat bagian [Konfigurasi](#-konfigurasi)).

### 4. Inisialisasi Database

```bash
npm run db:init
```

Script ini akan membuat file `data/serverbot.db` dengan schema yang dibutuhkan.

### 5. Buat Bot Telegram

1. Buka Telegram, cari **@BotFather**
2. Kirim `/newbot`
3. Ikuti instruksi — masukkan nama dan username bot
4. Salin **Bot Token** yang diberikan
5. Paste token ke `.env` pada field `BOT_TOKEN`

---

## ⚙️ Konfigurasi

### File `.env`

```env
# ─── Telegram ────────────────────────────────────────
BOT_TOKEN=123456789:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Whitelist user ID Telegram yang boleh pakai bot
# Cari user ID kamu via @userinfobot di Telegram
# Pisahkan dengan koma jika lebih dari satu
ALLOWED_USER_IDS=123456789,987654321

# ─── Enkripsi ────────────────────────────────────────
# Generate dengan: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=your_64_char_hex_key_here

# ─── Database ────────────────────────────────────────
DB_PATH=./data/serverbot.db

# ─── Bot Settings ────────────────────────────────────
# Timeout koneksi SSH dalam milidetik
SSH_TIMEOUT_MS=15000

# Timeout eksekusi command CLI dalam milidetik
CLI_TIMEOUT_MS=30000

# Jumlah baris log default yang ditampilkan
LOG_DEFAULT_LINES=50

# ─── Environment ─────────────────────────────────────
NODE_ENV=production
```

### Generate Encryption Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Salin outputnya ke `ENCRYPTION_KEY` di `.env`.

---

## ▶️ Menjalankan Bot

### Development (dengan auto-reload)

```bash
npm run dev
```

### Production

```bash
npm start
```

### Dengan PM2 (direkomendasikan untuk production)

```bash
# Install PM2 jika belum ada
npm install -g pm2

# Jalankan bot
pm2 start ecosystem.config.js

# Auto-start saat server reboot
pm2 startup
pm2 save

# Cek status
pm2 status

# Lihat log bot
pm2 logs serverbot
```

### File `ecosystem.config.js`

```javascript
module.exports = {
  apps: [{
    name: 'serverbot',
    script: 'src/index.js',
    watch: false,
    env_production: {
      NODE_ENV: 'production'
    }
  }]
}
```

---

## 📱 Panduan Penggunaan Bot

### Command yang Tersedia

| Command | Fungsi |
|---------|--------|
| `/start` | Buka menu utama & daftar server |
| `/exit` | Keluar dari CLI Mode |
| `/help` | Tampilkan bantuan |

---

### 1. Memulai Bot

Kirim `/start` ke bot. Jika belum ada server, kamu akan melihat:

```
🤖 Selamat datang di ServerBot!

Belum ada server yang ditambahkan.
Tambahkan server pertamamu untuk mulai monitoring.

  [➕ Tambah Server]
```

Jika sudah ada server:

```
🖥 Pilih Server

  [🟢 production-01]   [🔴 staging-02]
  [🟢 db-server]
  
  [➕ Tambah Server]
```

> 🟢 = koneksi OK saat terakhir dicek | 🔴 = koneksi gagal / belum dicek

---

### 2. Menambahkan Server

Tekan **[➕ Tambah Server]**, lalu pilih mode input:

```
Pilih cara menambahkan server:

  [📋 Form Template]   [💻 String CLI]
```

#### Mode Form Template

Bot akan memandu kamu step-by-step:

```
Step 1/6 — Nama alias server:
(contoh: production-api, db-utama)
```

```
Step 2/6 — Host / IP Address:
(contoh: 192.168.1.10 atau domain.com)
```

```
Step 3/6 — Port SSH: (default: 22)
```

```
Step 4/6 — Username SSH:
(contoh: root, ubuntu, deploy)
```

```
Step 5/6 — Metode autentikasi:

  [🔑 Password]   [📄 SSH Key]
```

```
Step 6/6 — Konfirmasi:

Server  : production-api
Host    : 192.168.1.10
Port    : 22
User    : root
Auth    : Password ✓

  [✅ Simpan]   [❌ Batal]
```

#### Mode String CLI

Kirim string SSH langsung:

```
Kirim command SSH kamu:
(contoh: ssh root@192.168.1.10 -p 2222)
```

Bot akan otomatis mem-parse host, user, dan port dari string tersebut, lalu meminta password atau SSH key.

---

### 3. Menu Aksi Server

Setelah memilih server, kamu akan melihat menu aksi:

```
🖥 production-api  🟢 Online

  [💻 CLI Mode]        [📋 Spesifikasi]
  [💾 Disk Usage]      [🧠 Memory Usage]
  [🔧 Services]        [📜 Lihat Log]
  
  [🔙 Kembali]
```

---

### 4. Melihat Spesifikasi Server

Tekan **[📋 Spesifikasi]**:

```
📋 Spesifikasi — production-api

OS      : Ubuntu 22.04.3 LTS
Kernel  : 5.15.0-91-generic
CPU     : Intel(R) Xeon(R) CPU E5-2670 v3
Cores   : 8 core
Arch    : x86_64
Uptime  : 14 days, 3 hours

  [🔄 Refresh]   [🔙 Kembali]
```

---

### 5. Melihat Disk Usage

Tekan **[💾 Disk Usage]**:

```
💾 Disk Usage — production-api

Filesystem       Size   Used   Avail  Use%
/                50G    23G    27G    46%  ▓▓▓▓░░░░░░
/data            200G   150G   50G    75%  ▓▓▓▓▓▓▓░░░
/var             20G    4.1G   15.9G  21%  ▓▓░░░░░░░░

  [🔄 Refresh]   [🔙 Kembali]
```

> ⚠️ Disk usage ≥ 85% akan ditandai dengan indikator merah.

---

### 6. Melihat Memory Usage

Tekan **[🧠 Memory Usage]**:

```
🧠 Memory Usage — production-api

RAM   : ▓▓▓▓░░░░░░  3.2G / 8.0G  (40%)
Swap  : ▓▓░░░░░░░░  512M / 2.0G  (25%)

  [🔄 Refresh]   [🔙 Kembali]
```

---

### 7. Manajemen Service

Tekan **[🔧 Services]**. Bot hanya menampilkan service yang terdeteksi di server:

```
🔧 Pilih jenis service:

  [📦 PM2]   [🐳 Docker]   [🌐 Nginx]
  
  [🔙 Kembali]
```

#### List PM2 Apps

```
📦 PM2 Apps — production-api

• api-server     🟢 online   ↑ 2d 3h   128MB
• worker-cron    🔴 stopped
• frontend-ssr   🟡 errored  ↑ 0m

  [🔄 Restart api-server]
  [🔄 Restart worker-cron]
  [🔄 Restart frontend-ssr]
  [🔄 Restart Semua]
  [🔙 Kembali]
```

#### List Docker Containers

```
🐳 Docker Containers — production-api

• nginx-proxy    🟢 Up 3 hours     :80, :443
• mysql-db       🟢 Up 2 days      :3306
• redis-cache    🔴 Exited (1)

  [🔄 Restart nginx-proxy]
  [🔄 Restart mysql-db]
  [🔄 Restart redis-cache]
  [🔙 Kembali]
```

#### Konfirmasi Restart

Setelah menekan tombol restart:

```
⚠️ Konfirmasi Restart

Yakin ingin restart service berikut?
→ pm2: api-server

  [✅ Ya, Restart]   [❌ Batal]
```

Jika berhasil:

```
✅ Restart Berhasil

Service  : pm2 → api-server
Status   : online
Waktu    : 14:32:05 WIB
```

---

### 8. Melihat Log

Tekan **[📜 Lihat Log]**, lalu pilih sumber log:

```
📜 Pilih sumber log:

  [Nginx Error]    [Nginx Access]
  [Docker: nginx-proxy]
  [PM2: api-server]
  [Journalctl]
  
  [🔙 Kembali]
```

Pilih jumlah baris:

```
Tampilkan berapa baris terakhir?

  [20 baris]   [50 baris]   [100 baris]
```

Output log:

```
📜 Nginx Error Log — production-api
(50 baris terakhir)

2024/01/15 14:28:01 [error] 1234#0: *5 connect() failed
2024/01/15 14:28:05 [warn] 1234#0: upstream response timeout
...

  [🔄 Refresh]   [🔙 Kembali]
```

---

### 9. CLI Mode

Tekan **[💻 CLI Mode]**:

```
💻 CLI Mode Aktif
Server: production-api

Ketik command untuk dieksekusi langsung di server.
Ketik /exit untuk keluar dari CLI Mode.

⚠️ Command berbahaya (rm -rf, shutdown, dll) akan diblokir.
```

Contoh penggunaan:

```
Kamu  : ls -la /var/www
Bot   : total 48
        drwxr-xr-x 6 www-data www-data 4096 Jan 15 10:00 .
        drwxr-xr-x 14 root root 4096 Jan 10 08:00 ..
        drwxr-xr-x 3 www-data www-data 4096 Jan 15 10:00 html
```

```
Kamu  : df -h
Bot   : Filesystem      Size  Used Avail Use% Mounted on
        /dev/sda1        50G   23G   27G  46% /
```

Ketik `/exit` atau tekan **[❌ Keluar CLI]** untuk kembali ke menu server.

---

## 🔐 Keamanan

### Whitelist User
Bot hanya bisa diakses oleh Telegram User ID yang terdaftar di `ALLOWED_USER_IDS`. Siapapun yang tidak terdaftar akan mendapat pesan "Akses ditolak" dan request mereka tidak akan diproses.

### Enkripsi Kredensial
Password dan SSH key path dienkripsi menggunakan **AES-256-GCM** sebelum disimpan ke database. `ENCRYPTION_KEY` di `.env` harus dijaga kerahasiaannya.

### Command Blacklist (CLI Mode)
Command berikut diblokir di CLI Mode:

```
rm -rf /      shutdown      reboot       halt
mkfs          dd if=        poweroff     init 0
> /dev/sda    chmod 777 /   chown -R /
```

### SSH Timeout
Koneksi SSH otomatis terputus jika:
- Tidak bisa terhubung dalam **15 detik** (`SSH_TIMEOUT_MS`)
- Command tidak selesai dalam **30 detik** (`CLI_TIMEOUT_MS`)

### Rekomendasi Tambahan
- Jalankan bot server di balik firewall, jangan expose port apapun ke publik
- Gunakan SSH Key daripada password untuk autentikasi server
- Buat dedicated user SSH di server target dengan privilege minimal (bukan root jika memungkinkan)
- Backup file `.env` dan `data/serverbot.db` secara berkala

---

## 🛠 Troubleshooting

### Bot tidak merespons

1. Pastikan `BOT_TOKEN` di `.env` sudah benar
2. Cek apakah bot sedang running: `pm2 status` atau `ps aux | grep node`
3. Cek log: `pm2 logs serverbot` atau `npm run dev`

### Koneksi SSH gagal

```
❌ Koneksi gagal: Connection timed out
```

- Pastikan IP/host dan port SSH benar
- Pastikan firewall server target mengizinkan koneksi dari IP bot server
- Test koneksi manual: `ssh user@host -p port`

### "Akses ditolak" saat pakai bot

- Cek `ALLOWED_USER_IDS` di `.env`
- Cari Telegram User ID kamu via [@userinfobot](https://t.me/userinfobot)
- Tambahkan ID kamu ke `ALLOWED_USER_IDS`, lalu restart bot

### Database error saat start

```bash
# Reset database (HATI-HATI: semua data server akan terhapus)
rm data/serverbot.db
npm run db:init
```

### Pesan bot terpotong

Telegram membatasi pesan maksimal **4096 karakter**. Log yang panjang akan otomatis dipotong oleh bot. Jika ingin lebih banyak baris, gunakan CLI Mode dengan `tail -n 200 /path/to/log`.

---

## 📁 Struktur Project

```
serverbot/
├── src/
│   ├── index.js              # Entry point, inisialisasi bot
│   ├── handlers/
│   │   ├── start.js          # Handler /start, menu utama
│   │   ├── addServer.js      # Flow tambah server
│   │   ├── serverMenu.js     # Menu aksi per server
│   │   ├── specs.js          # Spesifikasi, disk, memory
│   │   ├── services.js       # PM2, Docker, Nginx management
│   │   ├── logs.js           # Log viewer
│   │   └── cli.js            # CLI mode handler
│   ├── services/
│   │   ├── ssh.js            # SSH connection & command executor
│   │   ├── parsers.js        # Parser output command (df, free, pm2, docker)
│   │   ├── crypto.js         # Enkripsi/dekripsi kredensial
│   │   └── blacklist.js      # Command blacklist untuk CLI mode
│   ├── db/
│   │   ├── index.js          # Koneksi SQLite
│   │   ├── init.sql          # Schema database
│   │   └── servers.js        # Query CRUD server
│   └── utils/
│       ├── format.js         # Formatter pesan Telegram (tabel, progress bar)
│       ├── middleware.js     # Auth middleware (whitelist check)
│       └── logger.js         # Logger (Winston / Pino)
├── data/
│   └── serverbot.db          # SQLite database (auto-generated)
├── .env.example              # Template environment variable
├── .env                      # ⚠️ Jangan di-commit ke git!
├── .gitignore
├── ecosystem.config.js       # PM2 config
├── package.json
├── TASK_ENGINEER.md
└── README.md
```

---

## 📄 .gitignore yang Direkomendasikan

```gitignore
node_modules/
.env
data/
*.db
*.log
.DS_Store
```

---

## 📦 Dependencies Utama

```json
{
  "telegraf": "^4.x",        // Telegram bot framework
  "node-ssh": "^13.x",       // SSH client
  "better-sqlite3": "^9.x",  // SQLite database
  "dotenv": "^16.x",         // Environment variables
  "winston": "^3.x"          // Logging
}
```

Install semua:

```bash
npm install telegraf node-ssh better-sqlite3 dotenv winston
```

---

<div align="center">

Made with ❤️ for DevOps on-the-go

</div>
