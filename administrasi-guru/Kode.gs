/**
 * ADMINISTRASI GURU MINGGUAN — Rekap Otomatis Gmail ➜ Google Sheet
 * ------------------------------------------------------------------
 * Setiap email masuk ber-subjek "Administrasi Guru Mingguan" dicatat
 * otomatis ke Google Sheet ini, satu sheet untuk setiap minggu
 * (Senin–Minggu), misalnya "9-15 Nov 26", lalu "16-22 Nov 26", dst.
 *
 * Kolom: No | Nama Guru | Email | Tanggal Diterima | Waktu Diterima | Isi Email
 *
 * Cara pasang: lihat README.md (cukup jalankan fungsi `pasangOtomatis` sekali).
 */

// ========================= PENGATURAN =========================
var CONFIG = {
  SUBJEK: 'Administrasi Guru Mingguan', // subjek yang dicari (huruf besar/kecil diabaikan)
  ZONA_WAKTU: 'Asia/Jakarta',
  INTERVAL_MENIT: 5,                    // seberapa sering Gmail dicek (1, 5, 10, 15, atau 30)
  ABAIKAN_EMAIL_SENDIRI: true,          // email yang Anda kirim sendiri tidak dicatat
  HEADER: ['No', 'Nama Guru', 'Email', 'Tanggal Diterima', 'Waktu Diterima', 'Isi Email'],
  LEBAR_KOLOM: [50, 200, 240, 130, 110, 520],
  WARNA_HEADER: '#1f3a5f'
};

var BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
var PROP_WAKTU_TERAKHIR = 'AGM_WAKTU_TERAKHIR';
var PROP_ID_TERAKHIR = 'AGM_ID_TERAKHIR';
var BATAS_SEL = 49000; // batas aman isi 1 sel Google Sheets (maks 50.000 karakter)

// ========================= MENU =========================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📋 Administrasi Guru')
    .addItem('Ambil email sekarang', 'ambilEmailAdministrasi')
    .addItem('Aktifkan otomatis', 'pasangOtomatis')
    .addItem('Matikan otomatis', 'hentikanOtomatis')
    .addToUi();
}

// ========================= PEMASANGAN =========================
/** Jalankan SEKALI: membuat pemicu otomatis + langsung mengambil email minggu ini. */
function pasangOtomatis() {
  hentikanOtomatis();
  ScriptApp.newTrigger('ambilEmailAdministrasi')
    .timeBased()
    .everyMinutes(CONFIG.INTERVAL_MENIT)
    .create();

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty(PROP_WAKTU_TERAKHIR)) {
    // Mulai dari Senin 00:00 minggu ini, agar email minggu berjalan ikut tercatat.
    props.setProperty(PROP_WAKTU_TERAKHIR, String(awalMinggu_(new Date()).getTime() - 1));
  }
  ambilEmailAdministrasi();
  toast_('Otomatis aktif ✔ Gmail dicek setiap ' + CONFIG.INTERVAL_MENIT + ' menit.');
}

/** Menghapus pemicu otomatis. */
function hentikanOtomatis() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'ambilEmailAdministrasi') ScriptApp.deleteTrigger(t);
  });
}

// ========================= PROSES UTAMA =========================
function ambilEmailAdministrasi() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) return; // proses lain sedang berjalan

  try {
    var props = PropertiesService.getScriptProperties();
    var waktuTerakhir = Number(props.getProperty(PROP_WAKTU_TERAKHIR)) ||
      (awalMinggu_(new Date()).getTime() - 1);
    var idTerakhir = JSON.parse(props.getProperty(PROP_ID_TERAKHIR) || '[]');
    var sudah = {};
    idTerakhir.forEach(function (id) { sudah[id] = true; });

    var saya = (Session.getEffectiveUser().getEmail() || '').toLowerCase();
    var subjekKecil = CONFIG.SUBJEK.toLowerCase();

    // Cari di Gmail (mundur 1 jam sebagai pengaman, duplikat disaring di bawah).
    var query = 'subject:"' + CONFIG.SUBJEK + '" after:' +
      Math.floor((waktuTerakhir - 3600 * 1000) / 1000);

    var pesanBaru = [];
    var start = 0, ukuran = 100, threads;
    do {
      threads = GmailApp.search(query, start, ukuran);
      threads.forEach(function (thread) {
        thread.getMessages().forEach(function (msg) {
          var t = msg.getDate().getTime();
          if (t < waktuTerakhir || sudah[msg.getId()]) return;
          if (msg.isInTrash() || msg.isDraft()) return;
          if ((msg.getSubject() || '').toLowerCase().indexOf(subjekKecil) === -1) return;
          var pengirim = uraikanPengirim_(msg.getFrom());
          if (CONFIG.ABAIKAN_EMAIL_SENDIRI && pengirim.email === saya) return;
          pesanBaru.push({ msg: msg, waktu: t, pengirim: pengirim });
        });
      });
      start += ukuran;
    } while (threads.length === ukuran);

    if (!pesanBaru.length) return;

    // Urutkan dari yang paling awal diterima.
    pesanBaru.sort(function (a, b) { return a.waktu - b.waktu; });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    pesanBaru.forEach(function (p) {
      var sheet = sheetMinggu_(ss, p.msg.getDate());
      var nomor = Math.max(sheet.getLastRow(), 1); // baris 1 = header
      sheet.appendRow([
        nomor,
        p.pengirim.nama,
        p.pengirim.email,
        Utilities.formatDate(p.msg.getDate(), CONFIG.ZONA_WAKTU, 'dd/MM/yyyy'),
        Utilities.formatDate(p.msg.getDate(), CONFIG.ZONA_WAKTU, 'HH:mm:ss'),
        ringkasIsi_(p.msg)
      ]);

      waktuTerakhir = Math.max(waktuTerakhir, p.waktu);
      idTerakhir.push(p.msg.getId());
    });

    props.setProperty(PROP_WAKTU_TERAKHIR, String(waktuTerakhir));
    props.setProperty(PROP_ID_TERAKHIR, JSON.stringify(idTerakhir.slice(-200)));
  } finally {
    lock.releaseLock();
  }
}

// ========================= SHEET MINGGUAN =========================
/** Mengambil (atau membuat) sheet untuk minggu Senin–Minggu dari tanggal tsb. */
function sheetMinggu_(ss, tanggal) {
  var nama = namaSheetMinggu_(tanggal);
  var sheet = ss.getSheetByName(nama);
  if (sheet) return sheet;

  sheet = ss.insertSheet(nama, 0); // minggu terbaru selalu di depan
  var h = CONFIG.HEADER;
  sheet.getRange(1, 1, 1, h.length).setValues([h])
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground(CONFIG.WARNA_HEADER)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 32);
  CONFIG.LEBAR_KOLOM.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });

  var maks = sheet.getMaxRows();
  sheet.getRange(2, 4, maks - 1, 2).setNumberFormat('@');           // tanggal & waktu sebagai teks
  sheet.getRange(2, 1, maks - 1, 1).setHorizontalAlignment('center');
  sheet.getRange(2, 1, maks - 1, h.length).setVerticalAlignment('top');
  sheet.getRange(2, 6, maks - 1, 1).setWrap(true);

  // Hapus "Sheet1" bawaan bila masih kosong.
  var bawaan = ss.getSheetByName('Sheet1') || ss.getSheetByName('Lembar1');
  if (bawaan && bawaan.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(bawaan);

  return sheet;
}

/** Contoh hasil: "9-15 Nov 26", "30 Nov-6 Des 26", "29 Des 25-4 Jan 26". */
function namaSheetMinggu_(tanggal) {
  var senin = awalMingguUTC_(tanggal);
  var minggu = new Date(senin.getTime() + 6 * 86400000);

  var d1 = senin.getUTCDate(), b1 = BULAN[senin.getUTCMonth()], y1 = String(senin.getUTCFullYear()).slice(-2);
  var d2 = minggu.getUTCDate(), b2 = BULAN[minggu.getUTCMonth()], y2 = String(minggu.getUTCFullYear()).slice(-2);

  if (y1 !== y2) return d1 + ' ' + b1 + ' ' + y1 + '-' + d2 + ' ' + b2 + ' ' + y2;
  if (b1 !== b2) return d1 + ' ' + b1 + '-' + d2 + ' ' + b2 + ' ' + y2;
  return d1 + '-' + d2 + ' ' + b2 + ' ' + y2;
}

/** Senin dari minggu tsb (berdasarkan zona waktu sekolah), sebagai tanggal UTC murni. */
function awalMingguUTC_(tanggal) {
  var tz = CONFIG.ZONA_WAKTU;
  var y = Number(Utilities.formatDate(tanggal, tz, 'yyyy'));
  var m = Number(Utilities.formatDate(tanggal, tz, 'M')) - 1;
  var d = Number(Utilities.formatDate(tanggal, tz, 'd'));
  var hari = Number(Utilities.formatDate(tanggal, tz, 'u')); // 1 = Senin ... 7 = Minggu
  return new Date(Date.UTC(y, m, d - (hari - 1)));
}

/** Senin 00:00 waktu sekolah sebagai titik waktu sebenarnya. */
function awalMinggu_(tanggal) {
  var s = awalMingguUTC_(tanggal);
  var teks = Utilities.formatDate(s, 'UTC', 'yyyy-MM-dd') + ' 00:00:00';
  return Utilities.parseDate(teks, CONFIG.ZONA_WAKTU, 'yyyy-MM-dd HH:mm:ss');
}

// ========================= ISI EMAIL =========================
function uraikanPengirim_(from) {
  from = from || '';
  var cocok = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  var nama = cocok ? cocok[1].trim() : '';
  var email = (cocok ? cocok[2] : from).trim().toLowerCase();
  if (!nama) nama = email.split('@')[0];
  return { nama: nama, email: email };
}

/** Isi email + daftar link + judul file lampiran. */
function ringkasIsi_(msg) {
  var teks = (msg.getPlainBody() || '')
    .replace(/\r/g, '')
    .split('\n')
    .filter(function (baris) { return !/^\s*>/.test(baris); }) // buang kutipan balasan
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  var bagian = [];
  if (teks) bagian.push(teks);

  var link = kumpulkanLink_(msg.getBody() || '', teks);
  if (link.length) {
    bagian.push('🔗 Link:\n' + link.map(function (l) {
      var judul = judulFileDrive_(l);
      return '• ' + (judul ? judul + ' — ' : '') + l;
    }).join('\n'));
  }

  var lampiran = msg.getAttachments({ includeInlineImages: false, includeAttachments: true });
  if (lampiran.length) {
    bagian.push('📎 File:\n' + lampiran.map(function (a) { return '• ' + a.getName(); }).join('\n'));
  }

  var hasil = bagian.join('\n\n') || '(email kosong)';
  if (hasil.length > BATAS_SEL) hasil = hasil.slice(0, BATAS_SEL) + '\n… (dipotong)';
  return hasil;
}

function kumpulkanLink_(html, teks) {
  var hasil = [], ada = {};
  function tambah(url) {
    url = url.replace(/&amp;/g, '&').replace(/[.,;:!?)\]]+$/, '').trim();
    // Buka link pengalihan Google (google.com/url?q=...)
    var alih = url.match(/^https?:\/\/(?:www\.)?google\.com\/url\?(?:.*&)?q=([^&]+)/);
    if (alih) { try { url = decodeURIComponent(alih[1]); } catch (e) {} }
    if (!/^https?:\/\//i.test(url) || ada[url]) return;
    ada[url] = true;
    hasil.push(url);
  }
  var m, reHref = /href\s*=\s*["']([^"']+)["']/gi;
  while ((m = reHref.exec(html)) !== null) tambah(m[1]);
  var reUrl = /https?:\/\/[^\s<>"']+/gi;
  while ((m = reUrl.exec(teks)) !== null) tambah(m[0]);
  return hasil;
}

/** Jika link mengarah ke file Google Drive/Docs, ambil judul filenya. */
function judulFileDrive_(url) {
  if (!/(drive|docs)\.google\.com/.test(url)) return '';
  var m = url.match(/\/d\/([a-zA-Z0-9_-]{20,})/) || url.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (!m) return '';
  try {
    return DriveApp.getFileById(m[1]).getName();
  } catch (e) {
    try { return DriveApp.getFolderById(m[1]).getName(); } catch (e2) { return ''; }
  }
}

// ========================= BANTUAN =========================
function toast_(pesan) {
  try { SpreadsheetApp.getActiveSpreadsheet().toast(pesan, 'Administrasi Guru', 5); } catch (e) {}
}
