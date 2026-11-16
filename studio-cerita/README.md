# Studio Cerita — Narasi menjadi Animasi (Google Apps Script)

Tulis cerita, lalu lihat cerita itu bergerak. Pengguna masuk dengan username & kata sandi, menulis episode, mengunggah suara tokoh, menayangkan karyanya di Galeri (lengkap dengan nama animasi & nama animator), lalu mengunduh hasilnya sebagai video.

## Fitur
| Kebutuhan | Cara kerjanya |
|---|---|
| Narasi → animasi | Cerita diurai menjadi adegan: tempat (hutan, pantai, kota, sekolah, rumah, taman, gunung, desa, angkasa), waktu (pagi/siang/sore/malam), cuaca, tokoh, perasaan, gerakan, dan dialog. Lalu digambar sebagai animasi kartun dengan transisi dan musik latar. |
| Tanpa teks di animasi | Bawaannya animasi hanya berisi **suara dan karakter**. Tokoh yang sedang bicara ditandai dengan mulut/kepala yang bergerak, gelombang suara, dan sorotan lembut di kakinya. Centang **Teks** di bawah pemutar bila sesekali ingin menampilkan judul, nama tokoh, balon kata, dan narasi. |
| Foto referensi | Di halaman animasi: **Foto Referensi**. **Latar**: foto tempat (isi kata tempat seperti `hutan` agar dipakai di adegan yang menyebut kata itu, atau kosongkan untuk semua adegan; bila tak ada yang cocok, foto latar yang ada tetap dipakai bergiliran), tampil penuh dengan gerak zoom perlahan. **Tokoh**: isi nama tokoh, wajah dari foto menjadi kepala tokoh yang bergerak, berbicara, dan berekspresi. Foto otomatis diperkecil di browser. |
| Halaman depan ada username & kata sandi | Tab **Masuk** / **Daftar**. Kata sandi disimpan sebagai hash (SHA‑256 + salt), sesi 6 jam, dan akun dikunci sementara setelah 5 kali salah. |
| Menulis cerita sendiri | **Studio Saya → + Animasi Baru → + Episode Baru**. Tombol **Pratinjau** langsung memutar hasilnya. |
| Tayang dengan nama animasi & animator, bisa banyak episode | Galeri dan halaman pemutar menampilkan nama animasi, nama animator, dan daftar episode. Bila **Teks** dicentang, video juga diberi kartu judul ("Karya …") dan penutup ("Tamat"/"Bersambung…"). |
| Unggah audio → suara ditiru | Di halaman animasi: **Suara Pembaca**. Rekaman dipakai sebagai *contoh suara*: layanan peniruan suara (ElevenLabs) mempelajari gayanya, lalu **membacakan setiap baris narasi & dialog sesuai teks cerita** dengan suara itu. Nama **Narator** = pembaca narasi (dan tokoh yang tak punya suara sendiri); nama tokoh = pembaca dialog tokoh itu. Suara dibuat otomatis saat **Simpan & Tayangkan**, disimpan di Drive, dan ikut terekam di video unduhan. |
| Hasil bisa diunduh | **⬇ Unduh Video** (.webm/.mp4, direkam di browser) dan **⬇ Unduh Naskah** (.json). Jika unduhan diblokir browser, ada tombol **Simpan ke Drive**. |

## Pemasangan (± 5 menit)
1. Buka <https://script.google.com> → **Proyek baru**, beri nama *Studio Cerita*.
2. Buat file berikut dan salin isinya dari folder ini:
   - `Code.gs` (ganti isi `Code.gs` bawaan)
   - File HTML: `Index`, `Styles`, `Renderer`, `App` (menu **+ → HTML**, tulis nama **tanpa** `.html`)
   - `appsscript.json`: **Setelan proyek (⚙) → centang "Tampilkan file manifes appsscript.json"**, lalu ganti isinya.
3. Pilih fungsi **`setup`** → **Jalankan** → izinkan akses. Spreadsheet database & folder Drive dibuat otomatis (tautannya ada di log).
4. **Terapkan → Deployment baru → Aplikasi web**
   - Jalankan sebagai: **Saya**
   - Yang memiliki akses: **Siapa saja** (atau hanya anggota domain sekolah)
5. Buka URL aplikasi web, lalu **Daftar** akun pertama.

### Aktifkan peniruan suara (ElevenLabs)
1. Buat akun di <https://elevenlabs.io>. Peniruan suara (*Instant Voice Cloning*) butuh paket berbayar; paket termurah sudah cukup.
2. Buka **Profile → API Keys**, buat kunci baru (beri izin *Text to Speech* dan *Voices*).
3. Di Apps Script: **Setelan proyek → Properti skrip**, tambahkan `ELEVENLABS_API_KEY` = kunci tadi. Opsional: `ELEVENLABS_MODEL` (bawaan `eleven_multilingual_v2`, mendukung bahasa Indonesia).
4. Deploy versi baru. Di halaman animasi, unggah suara bernama **Narator** dan centang persetujuan.

Tanpa kunci ini, aplikasi tetap berjalan: cerita dibacakan suara bawaan perangkat (tidak ikut terekam di video).

### Opsional: olah cerita dengan AI
**Setelan proyek → Properti skrip**, tambahkan `GEMINI_API_KEY` (dan opsional `GEMINI_MODEL`, bawaan `gemini-2.5-flash`). Kotak centang *"Bantu olah cerita dengan AI"* akan muncul di editor. Jika AI gagal, aplikasi kembali ke pengurai bawaan.

## Tips menulis
- Pisahkan adegan dengan **baris kosong**.
- Dialog: `"Halo!" kata Budi.`, `Budi berkata, "Halo!"`, atau format naskah `Budi: Halo!`
- Sebut tempat, waktu, perasaan (senang, sedih, takut, marah, kaget, sayang) dan gerakan (berjalan, berlari, melompat, menari, melambai, tidur, duduk).

## Yang perlu diketahui
- Video direkam secara langsung (real time) di browser, jadi durasi rekaman sama dengan panjang animasi. Biarkan tab tetap terbuka. Paling baik memakai Chrome atau Edge di komputer.
- Suara tiruan ikut terekam di video. Baris tanpa suara tiruan dibacakan suara bawaan perangkat yang **tidak** ikut terekam.
- Rekaman contoh terbaik: 30 detik–2 menit, satu orang, jernih, tanpa musik. Makin jernih contohnya, makin mirip hasilnya.
- Peniruan suara hanya untuk suara milik sendiri atau dengan izin pemiliknya (aplikasi meminta persetujuan setiap unggah).
- Biaya ElevenLabs dihitung per karakter teks yang dibacakan. Baris yang tidak berubah tidak dibacakan ulang, jadi menyimpan ulang episode tidak menambah biaya untuk baris yang sama.
- Untuk wajah tokoh, pakai foto yang wajahnya berada di tengah atau agak ke atas. Aplikasi otomatis memotongnya menjadi persegi.
- Batas: audio 10 MB per file, foto 5 MB (setelah diperkecil), cerita 20.000 karakter per episode, video yang disimpan ke Drive maksimal 45 MB.
- Semua data tersimpan di Google Drive milik akun yang men-deploy aplikasi.

## Struktur file
```
Code.gs        Server: akun, seri/episode, suara, pengurai narasi, AI opsional
Index.html     Kerangka halaman (masuk, galeri, studio, editor, pemutar)
Styles.html    Tampilan
Renderer.html  Mesin animasi: latar, tokoh, ekspresi, gerak, balon kata, musik, perekam video
App.html       Logika aplikasi di browser
appsscript.json Manifes (izin & pengaturan web app)
```
