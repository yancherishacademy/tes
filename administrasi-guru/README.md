# 📋 Administrasi Guru Mingguan — Rekap Otomatis

Setiap email ber-subjek **"Administrasi Guru Mingguan"** atau **"Weekly Teacher Administration"** yang masuk ke Gmail akan otomatis **dibalas** dan **tercatat** di Google Sheet, satu sheet per minggu (Senin–Minggu).

**Balasan otomatis:**
> Thank you for the weekly report, God bless.  
> Mr. Yan

| No | Nama Guru | Email | Tanggal Diterima | Waktu Diterima | Isi Email |
|----|-----------|-------|------------------|----------------|-----------|

- **Isi Email** berisi teks email, lalu daftar **🔗 Link** (link Google Drive/Docs ikut ditulis judul filenya) dan **📎 File** (judul file lampiran).
- Nama sheet mengikuti minggunya: `9-15 Nov 26` → `16-22 Nov 26` → `30 Nov-6 Des 26` → `28 Des 26-3 Jan 27`.
- Sheet minggu berjalan (lengkap dengan judul kolom) langsung dibuat saat skrip pertama dijalankan — `Sheet1` kosong otomatis diganti namanya. Setiap Senin otomatis muncul sheet minggu baru di paling depan, meski belum ada email. Penomoran dimulai lagi dari 1 setiap minggu.

## Cara memasang (±3 menit, cukup sekali)

1. Login ke Google dengan akun **yan@cherishacademy.sch.id**.
2. Buat Google Sheet baru, beri nama misalnya *Rekap Administrasi Guru*.
3. Klik **Ekstensi → Apps Script**.
4. Hapus isi `Code.gs`, lalu tempel seluruh isi file **`Kode.gs`**. Klik 💾 Simpan.
5. (Opsional) ⚙️ Setelan Proyek → centang *Tampilkan file manifes "appsscript.json"* → tempel isi **`appsscript.json`** (zona waktu Asia/Jakarta).
6. Pilih fungsi **`pasangOtomatis`** di toolbar, klik **▶ Jalankan**, lalu izinkan akses (Gmail, Sheets, Drive).
   Jika muncul "Google belum memverifikasi aplikasi ini" → *Lanjutan* → *Buka (tidak aman)* — ini aman karena skripnya milik Anda sendiri.
7. Selesai ✔ Email minggu berjalan langsung tercatat, dan Gmail dicek ulang otomatis setiap 5 menit.

Setelah Sheet dibuka ulang, ada menu **📋 Administrasi Guru** untuk *Ambil email sekarang*, *Aktifkan otomatis*, dan *Matikan otomatis*.

## Pengaturan (bagian `CONFIG` di atas `Kode.gs`)

| Pengaturan | Bawaan | Fungsi |
|---|---|---|
| `SUBJEK` | `Administrasi Guru Mingguan`, `Weekly Teacher Administration` | Subjek yang dicari (balasan "Re: …" juga ikut) |
| `BALAS_OTOMATIS` | `true` | Nyalakan/matikan balasan otomatis |
| `TEKS_BALASAN` | *Thank you for the weekly report, God bless.* / *Mr. Yan* | Isi balasan (`\n` = baris baru) |
| `BALAS_MAKS_HARI` | `7` | Email yang lebih lama dari ini tetap dicatat, tapi tidak dibalas |
| `INTERVAL_MENIT` | `5` | Frekuensi cek Gmail (1, 5, 10, 15, 30) |
| `ABAIKAN_EMAIL_SENDIRI` | `true` | Email yang Anda kirim sendiri tidak dicatat |
| `ZONA_WAKTU` | `Asia/Jakarta` | Dasar tanggal, jam, dan pergantian minggu |

## Catatan
- Setiap email hanya dicatat **dan dibalas** sekali (tidak ada data ganda), meski skrip berjalan berulang kali.
- Status email di Gmail (dibaca/belum, label) tidak diubah sama sekali.
- Mau mengambil ulang dari awal? Apps Script → ⚙️ Setelan Proyek → *Properti skrip* → hapus `AGM_WAKTU_TERAKHIR` dan `AGM_ID_TERAKHIR`, lalu jalankan `pasangOtomatis` lagi.
