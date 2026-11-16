/**
 * STUDIO CERITA — Narasi menjadi Animasi
 * Google Apps Script Web App
 *
 * Penyimpanan:
 *  - Spreadsheet (dibuat otomatis) : Users, Series, Episodes, Voices
 *  - Folder Google Drive (otomatis) : audio referensi suara & video hasil
 *
 * Opsional: set Script Property GEMINI_API_KEY agar narasi diolah dengan AI.
 * Tanpa kunci AI, aplikasi tetap bekerja dengan pengurai narasi bawaan.
 */

const APP_NAME = 'Studio Cerita';
const SESSION_SECONDS = 6 * 60 * 60;            // batas maksimum CacheService (6 jam)
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;       // 10 MB per file suara
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;        // 5 MB per foto (sudah diperkecil di browser)
const MAX_VIDEO_BYTES = 45 * 1024 * 1024;       // 45 MB per video yang disimpan ke Drive
const MAX_NARRATION = 20000;                     // karakter per episode
const CELL_LIMIT = 45000;                        // batas aman isi sel Spreadsheet

const SHEETS = {
  Users:    ['username', 'salt', 'hash', 'displayName', 'createdAt'],
  Series:   ['id', 'title', 'description', 'owner', 'createdAt', 'updatedAt'],
  Episodes: ['id', 'seriesId', 'number', 'title', 'narration', 'scenes', 'owner', 'createdAt', 'updatedAt'],
  Voices:   ['id', 'seriesId', 'owner', 'character', 'fileId', 'mimeType', 'fileName', 'createdAt', 'cloneId', 'consent'],
  Photos:   ['id', 'seriesId', 'owner', 'kind', 'name', 'fileId', 'mimeType', 'fileName', 'createdAt']
};

/* ============================== WEB APP ============================== */

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** Jalankan sekali dari editor untuk menyiapkan database & folder. */
function setup() {
  Object.keys(SHEETS).forEach(sheet_);
  folder_();
  Logger.log('Database: ' + db_().getUrl());
  Logger.log('Folder  : ' + folder_().getUrl());
}

/* ============================== DATABASE ============================== */

function db_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('DB_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* dibuat ulang di bawah */ }
  }
  const ss = SpreadsheetApp.create(APP_NAME + ' — Database');
  props.setProperty('DB_ID', ss.getId());
  return ss;
}

function sheet_(name) {
  const ss = db_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), SHEETS[name].length).setNumberFormat('@');
    sh.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
    const def = ss.getSheetByName('Sheet1') || ss.getSheetByName('Lembar1');
    if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
  } else if (sh.getLastColumn() < SHEETS[name].length) {
    sh.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]).setFontWeight('bold');
  }
  return sh;
}

function rows_(name) {
  const values = sheet_(name).getDataRange().getValues();
  const head = values.shift() || [];
  return values.map(function (r, i) {
    const o = { _row: i + 2 };
    head.forEach(function (k, j) { o[k] = String(r[j] === null || r[j] === undefined ? '' : r[j]); });
    return o;
  });
}

function insert_(name, obj) {
  const sh = sheet_(name);
  const vals = SHEETS[name].map(function (k) { return obj[k] === undefined ? '' : String(obj[k]); });
  const row = sh.getLastRow() + 1;
  sh.getRange(row, 1, 1, vals.length).setNumberFormat('@').setValues([vals]);
}

function update_(name, row, obj) {
  const vals = SHEETS[name].map(function (k) { return obj[k] === undefined ? '' : String(obj[k]); });
  sheet_(name).getRange(row, 1, 1, vals.length).setNumberFormat('@').setValues([vals]);
}

function deleteRows_(name, predicate) {
  const sh = sheet_(name);
  rows_(name).filter(predicate).map(function (r) { return r._row; })
    .sort(function (a, b) { return b - a; })
    .forEach(function (row) { sh.deleteRow(row); });
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function folder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* dibuat ulang */ }
  }
  const f = DriveApp.createFolder(APP_NAME + ' — Berkas');
  props.setProperty('FOLDER_ID', f.getId());
  return f;
}

function now_() { return new Date().toISOString(); }
function clean_(s, max) { return String(s === undefined || s === null ? '' : s).replace(/\u0000/g, '').trim().slice(0, max || 200); }

/* ============================== AKUN ============================== */

function hash_(password, salt) {
  let bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + password, Utilities.Charset.UTF_8);
  for (let i = 0; i < 300; i++) {
    bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes.concat(Utilities.newBlob(salt).getBytes()));
  }
  return Utilities.base64Encode(bytes);
}

function register(username, password, displayName) {
  username = clean_(username, 40).toLowerCase();
  password = String(password || '');
  displayName = clean_(displayName, 60) || username;
  if (!/^[a-z0-9_.]{3,20}$/.test(username)) throw new Error('Username 3–20 karakter: huruf kecil, angka, titik, atau garis bawah.');
  if (password.length < 6) throw new Error('Kata sandi minimal 6 karakter.');
  withLock_(function () {
    if (rows_('Users').some(function (u) { return u.username === username; })) throw new Error('Username sudah dipakai. Coba nama lain, ya.');
    const salt = Utilities.getUuid();
    insert_('Users', { username: username, salt: salt, hash: hash_(password, salt), displayName: displayName, createdAt: now_() });
  });
  return login(username, password);
}

function login(username, password) {
  username = clean_(username, 40).toLowerCase();
  const cache = CacheService.getScriptCache();
  const failKey = 'fail_' + username;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= 5) throw new Error('Terlalu banyak percobaan. Tarik napas sejenak, lalu coba lagi 5 menit lagi.');
  const user = rows_('Users').filter(function (u) { return u.username === username; })[0];
  if (!user || hash_(String(password || ''), user.salt) !== user.hash) {
    cache.put(failKey, String(fails + 1), 300);
    throw new Error('Username atau kata sandi belum cocok.');
  }
  cache.remove(failKey);
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  cache.put('s_' + token, username, SESSION_SECONDS);
  return { token: token, user: { username: user.username, displayName: user.displayName } };
}

function logout(token) {
  if (token) CacheService.getScriptCache().remove('s_' + token);
  return true;
}

function me(token) {
  const username = auth_(token);
  return { username: username, displayName: displayNames_()[username] || username };
}

function auth_(token) {
  const u = token ? CacheService.getScriptCache().get('s_' + token) : null;
  if (!u) throw new Error('SESSION_EXPIRED');
  return u;
}

function displayNames_() {
  const map = {};
  rows_('Users').forEach(function (u) { map[u.username] = u.displayName || u.username; });
  return map;
}

/* ============================== SERI & EPISODE ============================== */

/** Semua seri yang sudah punya episode — tampil di Galeri dengan nama animator. */
function listGallery(token) {
  auth_(token);
  return seriesWithEpisodes_(null).filter(function (s) { return s.episodes.length > 0; });
}

function listMySeries(token) {
  return seriesWithEpisodes_(auth_(token));
}

function seriesWithEpisodes_(owner) {
  const names = displayNames_();
  const episodes = rows_('Episodes');
  return rows_('Series')
    .filter(function (s) { return !owner || s.owner === owner; })
    .map(function (s) {
      const eps = episodes.filter(function (e) { return e.seriesId === s.id; })
        .sort(function (a, b) { return Number(a.number) - Number(b.number); })
        .map(function (e) { return { id: e.id, number: Number(e.number), title: e.title, updatedAt: e.updatedAt }; });
      return {
        id: s.id, title: s.title, description: s.description,
        owner: s.owner, animator: names[s.owner] || s.owner,
        createdAt: s.createdAt, updatedAt: s.updatedAt, episodes: eps
      };
    })
    .sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
}

function saveSeries(token, data) {
  const owner = auth_(token);
  const title = clean_(data && data.title, 100);
  const description = clean_(data && data.description, 600);
  if (!title) throw new Error('Beri nama animasimu dulu, ya.');
  return withLock_(function () {
    if (data.id) {
      const s = ownedSeries_(data.id, owner);
      s.title = title; s.description = description; s.updatedAt = now_();
      update_('Series', s._row, s);
      return { id: s.id };
    }
    const id = Utilities.getUuid();
    insert_('Series', { id: id, title: title, description: description, owner: owner, createdAt: now_(), updatedAt: now_() });
    return { id: id };
  });
}

function deleteSeries(token, seriesId) {
  const owner = auth_(token);
  return withLock_(function () {
    ownedSeries_(seriesId, owner);
    rows_('Episodes').filter(function (e) { return e.seriesId === seriesId; }).forEach(function (e) { trashScenes_(e.scenes); });
    rows_('Voices').filter(function (v) { return v.seriesId === seriesId; }).forEach(function (v) { trashFile_(v.fileId); deleteClone_(v.cloneId); });
    rows_('Photos').filter(function (v) { return v.seriesId === seriesId; }).forEach(function (v) { trashFile_(v.fileId); });
    deleteRows_('Photos', function (v) { return v.seriesId === seriesId; });
    deleteRows_('Episodes', function (e) { return e.seriesId === seriesId; });
    deleteRows_('Voices', function (v) { return v.seriesId === seriesId; });
    deleteRows_('Series', function (s) { return s.id === seriesId; });
    return true;
  });
}

function ownedSeries_(seriesId, owner) {
  const s = rows_('Series').filter(function (x) { return x.id === seriesId; })[0];
  if (!s) throw new Error('Seri tidak ditemukan.');
  if (s.owner !== owner) throw new Error('Seri ini milik animator lain.');
  return s;
}

/** Ubah narasi menjadi adegan tanpa menyimpan (untuk pratinjau). */
function previewScenes(token, narration, useAI) {
  auth_(token);
  return buildStory_(clean_(narration, MAX_NARRATION), useAI);
}

function saveEpisode(token, data) {
  const owner = auth_(token);
  const title = clean_(data && data.title, 120);
  const narration = clean_(data && data.narration, MAX_NARRATION);
  if (!title) throw new Error('Episode ini butuh judul.');
  if (narration.length < 10) throw new Error('Tulis ceritanya sedikit lebih panjang, ya.');
  ownedSeries_(data.seriesId, owner);
  const story = data.story && data.story.scenes ? normalizeStory_(data.story) : buildStory_(narration, data.useAI);
  const json = JSON.stringify(story);

  return withLock_(function () {
    const series = ownedSeries_(data.seriesId, owner);
    let id = data.id;
    if (id) {
      const e = rows_('Episodes').filter(function (x) { return x.id === id && x.owner === owner; })[0];
      if (!e) throw new Error('Episode tidak ditemukan.');
      trashScenes_(e.scenes);
      e.title = title; e.narration = narration; e.scenes = packScenes_(json); e.updatedAt = now_();
      update_('Episodes', e._row, e);
    } else {
      id = Utilities.getUuid();
      const nums = rows_('Episodes').filter(function (e) { return e.seriesId === data.seriesId; }).map(function (e) { return Number(e.number) || 0; });
      const number = (nums.length ? Math.max.apply(null, nums) : 0) + 1;
      insert_('Episodes', { id: id, seriesId: data.seriesId, number: number, title: title, narration: narration,
        scenes: packScenes_(json), owner: owner, createdAt: now_(), updatedAt: now_() });
    }
    series.updatedAt = now_();
    update_('Series', series._row, series);
    return { id: id };
  });
}

function getEpisode(token, episodeId) {
  const viewer = auth_(token);
  const e = rows_('Episodes').filter(function (x) { return x.id === episodeId; })[0];
  if (!e) throw new Error('Episode tidak ditemukan.');
  const s = rows_('Series').filter(function (x) { return x.id === e.seriesId; })[0] || {};
  const names = displayNames_();
  const siblings = rows_('Episodes').filter(function (x) { return x.seriesId === e.seriesId; })
    .sort(function (a, b) { return Number(a.number) - Number(b.number); })
    .map(function (x) { return { id: x.id, number: Number(x.number), title: x.title }; });
  return {
    id: e.id, seriesId: e.seriesId, number: Number(e.number), title: e.title,
    narration: e.narration, story: JSON.parse(unpackScenes_(e.scenes) || '{"characters":[],"scenes":[]}'),
    seriesTitle: s.title || '', animator: names[e.owner] || e.owner, isOwner: e.owner === viewer,
    episodes: siblings, voices: voicesOf_(e.seriesId), photos: photosOf_(e.seriesId)
  };
}

function deleteEpisode(token, episodeId) {
  const owner = auth_(token);
  return withLock_(function () {
    const e = rows_('Episodes').filter(function (x) { return x.id === episodeId && x.owner === owner; })[0];
    if (!e) throw new Error('Episode tidak ditemukan.');
    trashScenes_(e.scenes);
    deleteRows_('Episodes', function (x) { return x.id === episodeId; });
    return true;
  });
}

function packScenes_(json) {
  if (json.length <= CELL_LIMIT) return json;
  const f = folder_().createFile('adegan-' + Utilities.getUuid() + '.json', json, MimeType.PLAIN_TEXT);
  return 'drive:' + f.getId();
}
function unpackScenes_(v) {
  v = String(v || '');
  return v.indexOf('drive:') === 0 ? DriveApp.getFileById(v.slice(6)).getBlob().getDataAsString() : v;
}
function trashScenes_(v) {
  v = String(v || '');
  if (v.indexOf('drive:') === 0) trashFile_(v.slice(6));
}
function trashFile_(id) {
  try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* sudah tidak ada */ }
}

/* ============================== SUARA (PENIRUAN SUARA) ==============================
 * Rekaman yang diunggah dipakai sebagai CONTOH suara. Layanan peniruan suara (ElevenLabs)
 * mempelajari gaya suaranya, lalu membacakan setiap baris narasi/dialog dengan suara itu.
 * Nama "Narator" = pembaca narasi. Nama tokoh = pembaca dialog tokoh itu.
 * Tokoh tanpa suara sendiri ikut dibacakan oleh suara Narator.
 * Script Properties: ELEVENLABS_API_KEY (wajib untuk fitur ini), ELEVENLABS_MODEL (opsional). */

const XI_BASE = 'https://api.elevenlabs.io/v1';

function xiKey_() { return PropertiesService.getScriptProperties().getProperty('ELEVENLABS_API_KEY'); }
function xiModel_() { return PropertiesService.getScriptProperties().getProperty('ELEVENLABS_MODEL') || 'eleven_multilingual_v2'; }
function isCloneEnabled() { return !!xiKey_(); }

function xiError_(res) {
  let msg = res.getContentText().slice(0, 300);
  try { const j = JSON.parse(res.getContentText()); msg = (j.detail && (j.detail.message || j.detail.status || j.detail)) || msg; } catch (e) { }
  return new Error('Layanan peniruan suara menolak permintaan (' + res.getResponseCode() + '): ' + (typeof msg === 'string' ? msg : JSON.stringify(msg)));
}

/** Buat suara tiruan dari rekaman di Drive. Mengembalikan voice_id. */
function cloneFromFile_(fileId, label) {
  const key = xiKey_();
  if (!key) throw new Error('Peniruan suara belum aktif. Admin perlu mengisi ELEVENLABS_API_KEY di Properti skrip.');
  const res = UrlFetchApp.fetch(XI_BASE + '/voices/add', {
    method: 'post', muteHttpExceptions: true, headers: { 'xi-api-key': key },
    payload: { name: ('Studio Cerita - ' + label).slice(0, 90), description: 'Dibuat dari rekaman yang diunggah ke Studio Cerita.',
      remove_background_noise: 'true', files: DriveApp.getFileById(fileId).getBlob() }
  });
  if (res.getResponseCode() !== 200) throw xiError_(res);
  return JSON.parse(res.getContentText()).voice_id;
}

function deleteClone_(cloneId) {
  const key = xiKey_();
  if (!cloneId || !key) return;
  try { UrlFetchApp.fetch(XI_BASE + '/voices/' + encodeURIComponent(cloneId), { method: 'delete', muteHttpExceptions: true, headers: { 'xi-api-key': key } }); } catch (e) { }
}

function voicesOf_(seriesId) {
  return rows_('Voices').filter(function (v) { return v.seriesId === seriesId; })
    .map(function (v) { return { id: v.id, character: v.character, fileName: v.fileName, mimeType: v.mimeType, cloned: !!v.cloneId }; });
}

function listVoices(token, seriesId) {
  auth_(token);
  return voicesOf_(seriesId);
}

function uploadVoice(token, data) {
  const owner = auth_(token);
  ownedSeries_(data.seriesId, owner);
  const character = clean_(data.character, 60);
  const mimeType = clean_(data.mimeType, 80) || 'audio/mpeg';
  if (!character) throw new Error('Tulis nama pemilik suara: "Narator" atau nama tokoh.');
  if (mimeType.indexOf('audio/') !== 0) throw new Error('Mohon unggah file audio (mp3, wav, m4a, ogg).');
  if (data.clone && !data.consent) throw new Error('Centang persetujuan bahwa kamu pemilik suara ini atau sudah mendapat izinnya.');
  const bytes = Utilities.base64Decode(String(data.base64 || ''));
  if (!bytes.length) throw new Error('File audio kosong.');
  if (bytes.length > MAX_AUDIO_BYTES) throw new Error('Ukuran audio maksimal 10 MB.');
  const fileName = clean_(data.fileName, 120) || (character + '.mp3');
  const file = folder_().createFile(Utilities.newBlob(bytes, mimeType, fileName));

  let cloneId = '';
  if (data.clone) {
    try { cloneId = cloneFromFile_(file.getId(), character); }
    catch (e) { trashFile_(file.getId()); throw e; }
  }

  return withLock_(function () {
    // Satu suara per nama per seri: ganti yang lama.
    const same = function (v) { return v.seriesId === data.seriesId && v.character.toLowerCase() === character.toLowerCase(); };
    rows_('Voices').filter(same).forEach(function (v) { trashFile_(v.fileId); deleteClone_(v.cloneId); });
    deleteRows_('Voices', same);
    const id = Utilities.getUuid();
    insert_('Voices', { id: id, seriesId: data.seriesId, owner: owner, character: character, fileId: file.getId(),
      mimeType: mimeType, fileName: fileName, createdAt: now_(), cloneId: cloneId, consent: data.consent ? now_() : '' });
    return { id: id, character: character, fileName: fileName, mimeType: mimeType, cloned: !!cloneId };
  });
}

/** Tiru suara dari rekaman yang sudah diunggah sebelumnya. */
function cloneVoice(token, voiceId, consent) {
  const owner = auth_(token);
  if (!consent) throw new Error('Centang persetujuan bahwa kamu pemilik suara ini atau sudah mendapat izinnya.');
  const v = rows_('Voices').filter(function (x) { return x.id === voiceId && x.owner === owner; })[0];
  if (!v) throw new Error('Suara tidak ditemukan.');
  const cloneId = cloneFromFile_(v.fileId, v.character);
  return withLock_(function () {
    const row = rows_('Voices').filter(function (x) { return x.id === voiceId; })[0];
    deleteClone_(row.cloneId);
    row.cloneId = cloneId; row.consent = now_();
    update_('Voices', row._row, row);
    return true;
  });
}

function getVoiceData(token, voiceId) {
  auth_(token);
  const v = rows_('Voices').filter(function (x) { return x.id === voiceId; })[0];
  if (!v) throw new Error('Suara tidak ditemukan.');
  return { character: v.character, mimeType: v.mimeType, base64: Utilities.base64Encode(DriveApp.getFileById(v.fileId).getBlob().getBytes()) };
}

function deleteVoice(token, voiceId) {
  const owner = auth_(token);
  return withLock_(function () {
    const v = rows_('Voices').filter(function (x) { return x.id === voiceId && x.owner === owner; })[0];
    if (!v) throw new Error('Suara tidak ditemukan.');
    trashFile_(v.fileId); deleteClone_(v.cloneId);
    deleteRows_('Voices', function (x) { return x.id === voiceId; });
    return true;
  });
}

/* ---------- membacakan cerita dengan suara tiruan ---------- */

function md5_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

/** Hasil suara disimpan di Drive dan dipakai ulang bila teks & suara sama. */
function synthLine_(cloneId, text) {
  const model = xiModel_();
  const name = 'suara-' + md5_(cloneId + '|' + model + '|' + text) + '.mp3';
  const folder = folder_();
  const found = folder.getFilesByName(name);
  if (found.hasNext()) return found.next().getId();
  const res = UrlFetchApp.fetch(XI_BASE + '/text-to-speech/' + encodeURIComponent(cloneId) + '?output_format=mp3_44100_64', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'xi-api-key': xiKey_(), 'Accept': 'audio/mpeg' },
    payload: JSON.stringify({ text: text, model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.85, style: 0.2, use_speaker_boost: true } })
  });
  if (res.getResponseCode() !== 200) throw xiError_(res);
  return folder.createFile(res.getBlob().setName(name)).getId();
}

/**
 * Buat suara tiruan untuk semua baris episode. Dipanggil berulang dari browser sampai done=true
 * (tiap panggilan berhenti sebelum batas waktu Apps Script).
 */
function generateEpisodeAudio(token, episodeId) {
  const owner = auth_(token);
  if (!xiKey_()) throw new Error('Peniruan suara belum aktif. Admin perlu mengisi ELEVENLABS_API_KEY di Properti skrip.');
  const started = Date.now();
  const e = rows_('Episodes').filter(function (x) { return x.id === episodeId && x.owner === owner; })[0];
  if (!e) throw new Error('Episode tidak ditemukan.');
  const story = JSON.parse(unpackScenes_(e.scenes));
  const clones = {};
  rows_('Voices').filter(function (v) { return v.seriesId === e.seriesId && v.cloneId; })
    .forEach(function (v) { clones[v.character.toLowerCase()] = v.cloneId; });
  const narrator = clones['narator'] || clones['narrator'] || '';
  const voiceFor = function (speaker) {
    const n = String(speaker || '').toLowerCase();
    return clones[n] || clones[n.split(' ').pop()] || narrator;
  };

  // Kumpulkan baris: [objek, field audio, field kunci, teks, voice]
  const lines = [];
  story.scenes.forEach(function (sc) {
    if (sc.narration) lines.push([sc, 'narrationAudio', 'narrationKey', sc.narration, narrator]);
    sc.dialogues.forEach(function (d) { lines.push([d, 'audio', 'audioKey', d.text, voiceFor(d.speaker)]); });
  });

  let done = 0, made = 0, timedOut = false;
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i], obj = L[0], key = L[4] ? md5_(L[4] + '|' + xiModel_() + '|' + L[3]) : '';
    if (!key) { delete obj[L[1]]; delete obj[L[2]]; done++; continue; }
    if (obj[L[2]] === key && obj[L[1]]) { done++; continue; }
    if (Date.now() - started > 240000) { timedOut = true; break; }
    obj[L[1]] = synthLine_(L[4], L[3]); obj[L[2]] = key; done++; made++;
  }

  if (made || lines.some(function (L) { return !L[4]; })) {
    withLock_(function () {
      const row = rows_('Episodes').filter(function (x) { return x.id === episodeId; })[0];
      if (!row) return;
      trashScenes_(row.scenes);
      row.scenes = packScenes_(JSON.stringify(story)); row.updatedAt = now_();
      update_('Episodes', row._row, row);
    });
  }
  return { done: !timedOut, finished: done, total: lines.length, voiced: lines.filter(function (L) { return L[4]; }).length };
}

/** Ambil audio baris (mp3) untuk diputar & direkam. Hanya file milik aplikasi ini. */
function getAudioBatch(token, ids) {
  auth_(token);
  const folderId = folder_().getId(), out = {};
  (ids || []).slice(0, 12).forEach(function (id) {
    id = String(id || '');
    if (!/^[\w-]{10,100}$/.test(id)) return;
    try {
      const f = DriveApp.getFileById(id), parents = f.getParents();
      let ok = false;
      while (parents.hasNext()) if (parents.next().getId() === folderId) ok = true;
      if (ok && /^suara-/.test(f.getName())) out[id] = Utilities.base64Encode(f.getBlob().getBytes());
    } catch (e) { /* lewati */ }
  });
  return out;
}

/* ============================== FOTO REFERENSI ============================== */
/* kind 'background' : latar adegan. name = kata tempat (mis. "hutan") atau kosong = semua adegan.
 * kind 'character'  : wajah tokoh. name = nama tokoh di cerita. */

function photosOf_(seriesId) {
  return rows_('Photos').filter(function (p) { return p.seriesId === seriesId; })
    .map(function (p) { return { id: p.id, kind: p.kind, name: p.name, fileName: p.fileName, mimeType: p.mimeType }; });
}

function listPhotos(token, seriesId) {
  auth_(token);
  return photosOf_(seriesId);
}

function uploadPhoto(token, data) {
  const owner = auth_(token);
  ownedSeries_(data.seriesId, owner);
  const kind = data.kind === 'character' ? 'character' : 'background';
  const name = clean_(data.name, 60);
  const mimeType = clean_(data.mimeType, 80) || 'image/jpeg';
  if (kind === 'character' && !name) throw new Error('Tulis nama tokoh untuk foto ini.');
  if (mimeType.indexOf('image/') !== 0) throw new Error('Mohon unggah file gambar (jpg, png, webp).');
  const bytes = Utilities.base64Decode(String(data.base64 || ''));
  if (!bytes.length) throw new Error('Foto kosong.');
  if (bytes.length > MAX_PHOTO_BYTES) throw new Error('Ukuran foto maksimal 5 MB.');
  const fileName = clean_(data.fileName, 120) || 'foto.jpg';
  const file = folder_().createFile(Utilities.newBlob(bytes, mimeType, fileName));
  const same = function (p) { return p.seriesId === data.seriesId && p.kind === kind && p.name.toLowerCase() === name.toLowerCase(); };

  return withLock_(function () {
    rows_('Photos').filter(same).forEach(function (p) { trashFile_(p.fileId); });
    deleteRows_('Photos', same);
    const id = Utilities.getUuid();
    insert_('Photos', { id: id, seriesId: data.seriesId, owner: owner, kind: kind, name: name, fileId: file.getId(),
      mimeType: mimeType, fileName: fileName, createdAt: now_() });
    return { id: id, kind: kind, name: name, fileName: fileName, mimeType: mimeType };
  });
}

function getPhotoData(token, photoId) {
  auth_(token);
  const p = rows_('Photos').filter(function (x) { return x.id === photoId; })[0];
  if (!p) throw new Error('Foto tidak ditemukan.');
  return { kind: p.kind, name: p.name, mimeType: p.mimeType, base64: Utilities.base64Encode(DriveApp.getFileById(p.fileId).getBlob().getBytes()) };
}

function deletePhoto(token, photoId) {
  const owner = auth_(token);
  return withLock_(function () {
    const p = rows_('Photos').filter(function (x) { return x.id === photoId && x.owner === owner; })[0];
    if (!p) throw new Error('Foto tidak ditemukan.');
    trashFile_(p.fileId);
    deleteRows_('Photos', function (x) { return x.id === photoId; });
    return true;
  });
}

/* ============================== VIDEO KE DRIVE ============================== */

/** Cadangan unduhan: simpan video hasil rekaman ke Drive dan kembalikan tautan unduh. */
function saveVideo(token, data) {
  auth_(token);
  const bytes = Utilities.base64Decode(String(data.base64 || ''));
  if (!bytes.length) throw new Error('Video kosong.');
  if (bytes.length > MAX_VIDEO_BYTES) throw new Error('Video terlalu besar untuk disimpan ke Drive (maks 45 MB).');
  const name = clean_(data.fileName, 150) || 'animasi.webm';
  const file = folder_().createFile(Utilities.newBlob(bytes, clean_(data.mimeType, 60) || 'video/webm', name));
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* kebijakan domain */ }
  return { url: 'https://drive.google.com/uc?export=download&id=' + file.getId(), viewUrl: file.getUrl() };
}

/* ============================== NARASI → ADEGAN ============================== */

const SETTINGS_KW = [
  ['forest',   /(hutan|rimba|pepohonan|pohon-pohon|forest|woods)/gi],
  ['beach',    /(pantai|laut|samudra|ombak|pesisir|pulau|beach|sea|ocean|island)/gi],
  ['mountain', /(gunung|bukit|pegunungan|puncak|mountain|hill)/gi],
  ['city',     /(kota|jalan raya|gedung|toko|pasar|city|town|street|shop)/gi],
  ['school',   /(sekolah|kelas|guru|murid|school|classroom|teacher)/gi],
  ['village',  /(desa|kampung|sawah|ladang|kandang|village|farm)/gi],
  ['room',     /(rumah|kamar|dapur|ruang|kasur|home|house|room|kitchen|bed)/gi],
  ['park',     /(taman|kebun|bunga|park|garden|flower)/gi],
  ['space',    /(angkasa|planet|roket|bulan purnama|galaksi|space|rocket|galaxy)/gi]
];
const TIME_KW = [
  ['night',   /(malam|tengah malam|gelap gulita|night|midnight)/i],
  ['dusk',    /(sore|senja|petang|matahari terbenam|sunset|evening)/i],
  ['morning', /(pagi|subuh|fajar|matahari terbit|morning|dawn|sunrise)/i],
  ['day',     /(siang|tengah hari|noon|afternoon)/i]
];
const WEATHER_KW = [['rain', /(hujan|gerimis|badai|rain|storm)/i], ['snow', /(salju|snow)/i]];
const EMOTION_KW = [
  ['love',      /(sayang|cinta|memeluk|berpelukan|rindu|love|hug)/i],
  ['happy',     /(senang|gembira|bahagia|tertawa|tersenyum|ceria|riang|syukur|happy|laugh|smile|joy|glad)/i],
  ['sad',       /(sedih|menangis|kecewa|murung|pilu|terisak|sad|cry|tears|upset)/i],
  ['angry',     /(marah|kesal|geram|murka|jengkel|angry|mad|furious)/i],
  ['scared',    /(takut|gemetar|cemas|khawatir|ngeri|scared|afraid|fear|worried)/i],
  ['surprised', /(terkejut|kaget|heran|takjub|terpana|tercengang|surprised|shocked|amazed)/i]
];
const ACTION_KW = [
  ['sleep', /(tidur|terlelap|mengantuk|sleep|nap|asleep)/i],
  ['dance', /(menari|berdansa|joget|bernyanyi|dance|sing)/i],
  ['jump',  /(melompat|lompat|meloncat|jump|hop)/i],
  ['run',   /(berlari|lari|mengejar|kabur|run|ran|chase)/i],
  ['wave',  /(melambai|menyapa|memanggil|wave|greet|call)/i],
  ['sit',   /(duduk|bersandar|sit|sat)/i],
  ['walk',  /(berjalan|melangkah|pergi|datang|pulang|menuju|walk|went|go|came)/i]
];
const SPEECH_VERBS = 'kata|ujar|ucap|seru|teriak|bisik|tanya|jawab|sahut|balas|pinta|gumam|said|asked|shouted|replied|whispered|cried';
const SPEECH_VERBS_BEFORE = 'berkata|bertanya|menjawab|berteriak|berbisik|berseru|menyahut|membalas|bilang|bergumam|said|asked|shouted|replied|whispered';
const STOPWORDS = ('Aku Saya Kamu Engkau Dia Ia Mereka Kami Kita Anda Saat Ketika Lalu Kemudian Setelah Sebelum Sesudah Di Ke Dari Pada Dan Tetapi Tapi ' +
  'Namun Akhirnya Suatu Hari Pagi Siang Sore Malam Esok Besok Kemarin Ini Itu Sang Si Para Semua Tiba Tiba-tiba Ya Tidak Bukan Oh Wah Hai Halo Ayo Mari ' +
  'Apa Siapa Mengapa Kenapa Bagaimana Dimana Kapan Jangan Terima Kasih Selamat Tamat Bab Episode Adegan Dengan Untuk Karena Sejak Hingga Sampai Juga ' +
  'Maka Jadi Jika Kalau Bila Agar Supaya Sambil Sementara Lalu Pun Tak Sudah Belum Masih Sangat Sekali Hore Aduh Astaga Tuhan Allah Yesus Amin ' +
  'The A An He She They It We I You Then When After Before One Day Once Upon All Suddenly Yes No Oh Hello Hi And But So My Your His Her Their Our ' +
  'Senin Selasa Rabu Kamis Jumat Sabtu Minggu Januari Februari Maret April Mei Juni Juli Agustus September Oktober November Desember Indonesia Jakarta').split(/\s+/);
const NAME_RX = "(?:(?:Pak|Bu|Bapak|Ibu|Kak|Kakak|Adik|Dik|Om|Tante|Kakek|Nenek|Paman|Bibi|Raja|Ratu|Putri|Pangeran|Mr|Mrs|Ms|Dr)\\.?\\s+)?[A-Z][a-z][\\w'-]*";

function buildStory_(narration, useAI) {
  if (useAI) {
    const ai = aiStory_(narration);
    if (ai) return ai;
  }
  return normalizeStory_(parseNarration_(narration));
}

function parseNarration_(text) {
  text = String(text || '').replace(/[“”„«»]/g, '"').replace(/[‘’]/g, "'").replace(/\r/g, '');
  const characters = detectCharacters_(text);
  const chunks = chunkText_(text);
  let prev = { setting: 'meadow', time: 'day', chars: [] };
  let lastSpeaker = null;

  const scenes = chunks.map(function (chunk) {
    const dialogues = [];
    let body = chunk;

    // Format naskah: "Nama: kalimat"
    body = body.replace(new RegExp('^\\s*(' + NAME_RX + '(?:\\s[A-Z][\\w\'-]*)?)\\s*:\\s*(.+)$', 'gm'), function (_, name, line) {
      const who = matchCharacter_(name, characters) || name.trim();
      if (characters.indexOf(who) < 0 && characters.length < 8) characters.push(who);
      dialogues.push({ speaker: who, text: line.replace(/^"|"$/g, '').trim() });
      return '';
    });

    // Kutipan: "..." kata Budi / Budi berkata, "..."
    const quoteRx = /"([^"]{1,400})"/g;
    let m;
    const sceneChars = charactersIn_(chunk, characters);
    while ((m = quoteRx.exec(chunk)) !== null) {
      const after = chunk.slice(m.index + m[0].length, m.index + m[0].length + 70);
      const before = chunk.slice(Math.max(0, m.index - 90), m.index);
      let speaker = null;
      const a = after.match(new RegExp('^\\s*[,.!?]?\\s*(?:' + SPEECH_VERBS + ')(?:nya)?\\s+(?:si\\s+|sang\\s+)?(' + NAME_RX + ')'));
      const b = before.match(new RegExp('(' + NAME_RX + ')\\s+(?:pun\\s+|lalu\\s+|segera\\s+)?(?:' + SPEECH_VERBS_BEFORE + ')[^".!?]*$'));
      if (a) speaker = matchCharacter_(a[1], characters) || a[1];
      else if (b) speaker = matchCharacter_(b[1], characters) || b[1];
      else if (sceneChars.length >= 2 && lastSpeaker) speaker = sceneChars.filter(function (c) { return c !== lastSpeaker; })[0];
      else speaker = sceneChars[0] || lastSpeaker || 'Narator';
      if (speaker !== 'Narator' && characters.indexOf(speaker) < 0 && characters.length < 8) characters.push(speaker);
      lastSpeaker = speaker;
      dialogues.push({ speaker: speaker, text: m[1].trim() });
    }

    // Narasi = kalimat-kalimat yang tidak berisi dialog.
    let narr = body.replace(/"[^"]*"/g, '\u00a7').replace(/\s+/g, ' ')
      .split(/(?<=[.!?\u00a7])\s+(?=[A-Z\u00a7])/)
      .filter(function (sen) { return sen.indexOf('\u00a7') < 0; })
      .join(' ').replace(/^[\s,.;:]+/, '').trim();
    if (narr.replace(/[^\w]/g, '').length < 3) narr = '';

    const setting = topMatch_(SETTINGS_KW, chunk) || prev.setting;
    const time = firstMatch_(TIME_KW, chunk) || prev.time;
    const weather = firstMatch_(WEATHER_KW, chunk) || 'clear';
    const mood = firstMatch_(EMOTION_KW, chunk) || 'calm';

    let present = sceneChars.slice();
    dialogues.forEach(function (d) {
      if (d.speaker !== 'Narator' && present.indexOf(d.speaker) < 0) present.push(d.speaker);
    });
    if (!present.length) present = prev.chars.slice();
    present = present.slice(0, 4);

    const sentences = chunk.match(/[^.!?\n]+[.!?]*"?/g) || [chunk];
    const chars = present.map(function (name) {
      const about = sentences.filter(function (s) { return s.indexOf(name) >= 0; }).join(' ') || chunk;
      return { name: name, emotion: firstMatch_(EMOTION_KW, about) || (mood === 'calm' ? 'neutral' : mood), action: firstMatch_(ACTION_KW, about) || 'idle' };
    });

    prev = { setting: setting, time: time, chars: present };
    return { source: chunk, narration: narr, setting: setting, time: time, weather: weather, mood: mood, characters: chars, dialogues: dialogues };
  });

  // Pastikan pembicara yang muncul juga terdaftar sebagai karakter.
  scenes.forEach(function (s) { s.dialogues.forEach(function (d) {
    if (d.speaker !== 'Narator' && characters.indexOf(d.speaker) < 0) characters.push(d.speaker);
  }); });
  return { characters: characters.map(function (n) { return { name: n }; }), scenes: scenes };
}

function chunkText_(text) {
  const paragraphs = text.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(String);
  const chunks = [];
  paragraphs.forEach(function (p) {
    if (p.length <= 380) { chunks.push(p); return; }
    const sentences = p.match(/[^.!?]+[.!?]+"?|[^.!?]+$/g) || [p];
    let cur = '';
    sentences.forEach(function (s) {
      const st = s.trim();
      const attach = /^[a-z,]/.test(st) || new RegExp('^(' + SPEECH_VERBS + ')\\b').test(st);
      if (cur && !attach && (cur + ' ' + st).length > 320) { chunks.push(cur.trim()); cur = st; }
      else cur += (cur ? ' ' : '') + st;
    });
    if (cur.trim()) chunks.push(cur.trim());
  });
  return chunks.slice(0, 60);
}

function detectCharacters_(text) {
  const counts = {}, strong = {};
  const rx = new RegExp(NAME_RX, 'g');
  let m;
  while ((m = rx.exec(text)) !== null) {
    const name = m[0].replace(/\s+/g, ' ');
    const first = name.split(' ')[0];
    if (STOPWORDS.indexOf(first) >= 0 && name.indexOf(' ') < 0) continue;
    const before = text.slice(0, m.index).replace(/\s+$/, '');
    const sentenceStart = !before || /[.!?"\n:]$/.test(before);
    counts[name] = (counts[name] || 0) + 1;
    if (!sentenceStart) strong[name] = (strong[name] || 0) + 1;
  }
  const speakerRx = new RegExp('(?:(?:' + SPEECH_VERBS + ')(?:nya)?\\s+(?:si\\s+|sang\\s+)?(' + NAME_RX + '))|(?:^\\s*(' + NAME_RX + ')\\s*:)|(?:(' + NAME_RX + ')\\s+(?:pun\\s+|lalu\\s+)?(?:' + SPEECH_VERBS_BEFORE + '))', 'gm');
  while ((m = speakerRx.exec(text)) !== null) {
    const n = (m[1] || m[2] || m[3]).replace(/\s+/g, ' ');
    if (STOPWORDS.indexOf(n) >= 0) continue;
    strong[n] = (strong[n] || 0) + 3; counts[n] = (counts[n] || 0) + 1;
  }
  let names = Object.keys(counts).filter(function (n) { return strong[n] && (counts[n] >= 2 || strong[n] >= 3); });
  // "Pak Budi" dan "Budi" dianggap satu tokoh.
  names = names.filter(function (n) { return !names.some(function (o) { return o !== n && o.split(' ').pop() === n && o.indexOf(' ') > 0; }); });
  return names.sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 6);
}

function matchCharacter_(name, characters) {
  name = String(name || '').trim();
  for (let i = 0; i < characters.length; i++) {
    const c = characters[i];
    if (c === name || c.split(' ').pop() === name || name.split(' ').pop() === c) return c;
  }
  return null;
}

function charactersIn_(text, characters) {
  return characters.filter(function (c) {
    return new RegExp('(^|[^\\w])' + c.split(' ').pop().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^\\w]|$)').test(text);
  });
}

function firstMatch_(list, text) {
  for (let i = 0; i < list.length; i++) { list[i][1].lastIndex = 0; if (list[i][1].test(text)) return list[i][0]; }
  return null;
}

function topMatch_(list, text) {
  let best = null, bestN = 0;
  list.forEach(function (it) { const n = (text.match(it[1]) || []).length; if (n > bestN) { best = it[0]; bestN = n; } });
  return best;
}

/** Rapikan & validasi struktur cerita (dari pengurai bawaan maupun AI). */
function normalizeStory_(story) {
  const SET = ['meadow', 'forest', 'beach', 'mountain', 'city', 'school', 'village', 'room', 'park', 'space'];
  const TIME = ['day', 'morning', 'dusk', 'night'];
  const WEATHER = ['clear', 'rain', 'snow'];
  const EMO = ['neutral', 'happy', 'sad', 'angry', 'scared', 'surprised', 'love'];
  const ACT = ['idle', 'walk', 'run', 'jump', 'dance', 'wave', 'sleep', 'sit'];
  const MOOD = ['calm', 'happy', 'sad', 'angry', 'scared', 'surprised', 'love'];
  const COLORS = ['#FF8A65', '#4FC3F7', '#AED581', '#BA68C8', '#FFD54F', '#F06292'];
  const pick = function (v, list, def) { v = String(v || '').toLowerCase(); return list.indexOf(v) >= 0 ? v : def; };

  const chars = [];
  (story.characters || []).slice(0, 8).forEach(function (c) {
    const name = clean_(c && (c.name || c), 40);
    if (name && name !== 'Narator' && !chars.some(function (x) { return x.name === name; })) chars.push({ name: name });
  });
  const scenes = (story.scenes || []).slice(0, 60).map(function (s) {
    const sc = {
      source: clean_(s.source || [s.narration].concat((s.dialogues || []).map(function (d) { return d.text; })).join(' '), 1500),
      narration: clean_(s.narration, 800),
      narrationAudio: /^[\w-]{10,100}$/.test(s.narrationAudio || '') ? s.narrationAudio : undefined,
      narrationKey: s.narrationKey ? clean_(s.narrationKey, 40) : undefined,
      setting: pick(s.setting, SET, 'meadow'), time: pick(s.time, TIME, 'day'),
      weather: pick(s.weather, WEATHER, 'clear'), mood: pick(s.mood, MOOD, 'calm'),
      characters: (s.characters || []).slice(0, 4).map(function (c) {
        return { name: clean_(c.name, 40), emotion: pick(c.emotion, EMO, 'neutral'), action: pick(c.action, ACT, 'idle') };
      }).filter(function (c) { return c.name; }),
      dialogues: (s.dialogues || []).slice(0, 20).map(function (d) {
        const o = { speaker: clean_(d.speaker, 40) || 'Narator', text: clean_(d.text, 400) };
        if (/^[\w-]{10,100}$/.test(d.audio || '')) { o.audio = d.audio; o.audioKey = clean_(d.audioKey, 40); }
        return o;
      }).filter(function (d) { return d.text; })
    };
    sc.characters.concat(sc.dialogues.map(function (d) { return { name: d.speaker }; })).forEach(function (c) {
      if (c.name !== 'Narator' && !chars.some(function (x) { return x.name === c.name; })) chars.push({ name: c.name });
    });
    return sc;
  }).filter(function (s) { return s.narration || s.dialogues.length; });

  chars.forEach(function (c, i) {
    c.color = COLORS[i % COLORS.length];
    c.pitch = [1.0, 1.35, 0.75, 1.2, 0.9, 1.5][i % 6];
    c.skin = i % 5;
  });
  return { version: 1, characters: chars, scenes: scenes };
}

/* ============================== AI (OPSIONAL) ============================== */

function aiStory_(narration) {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('GEMINI_API_KEY');
  if (!key) return null;
  const model = props.getProperty('GEMINI_MODEL') || 'gemini-2.5-flash';
  const prompt = [
    'Ubah narasi berikut menjadi naskah animasi anak yang hangat. Balas HANYA JSON valid dengan bentuk:',
    '{"characters":[{"name":"..."}],"scenes":[{"narration":"kalimat narator singkat","setting":"meadow|forest|beach|mountain|city|school|village|room|park|space",',
    '"time":"day|morning|dusk|night","weather":"clear|rain|snow","mood":"calm|happy|sad|angry|scared|surprised|love",',
    '"characters":[{"name":"...","emotion":"neutral|happy|sad|angry|scared|surprised|love","action":"idle|walk|run|jump|dance|wave|sleep|sit"}],',
    '"dialogues":[{"speaker":"nama karakter","text":"..."}]}]}',
    'Aturan: maksimal 4 karakter per adegan, 3-20 adegan, gunakan bahasa yang sama dengan narasi, jangan menambah isi yang tidak ada di cerita.',
    'NARASI:', narration
  ].join('\n');
  try {
    const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-goog-api-key': key },
      payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.4 } })
    });
    if (res.getResponseCode() !== 200) { console.warn('AI ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300)); return null; }
    const body = JSON.parse(res.getContentText());
    const txt = body.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join('');
    const story = normalizeStory_(JSON.parse(txt.replace(/^```(?:json)?|```$/g, '').trim()));
    return story.scenes.length ? story : null;
  } catch (e) {
    console.warn('AI gagal, memakai pengurai bawaan: ' + e);
    return null;
  }
}

function isAIEnabled() {
  return !!PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
}

/* ============================== UJI CEPAT ============================== */

function testParser() {
  const s = buildStory_('Di sebuah hutan yang rimbun, Kancil berjalan dengan riang.\n\n"Halo, Kura-kura!" seru Kancil sambil melambai.\n' +
    'Kura-kura tersenyum. "Mau lomba lari?" tanyanya.\n\nMalam itu hujan turun. Kancil ketakutan dan berlari pulang.', false);
  Logger.log(JSON.stringify(s, null, 2));
}
