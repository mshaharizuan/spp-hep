// ─── Constants ────────────────────────────────────────────────────────────────

const UITM_DOMAINS = ['@uitm.edu.my', '@student.uitm.edu.my'];
const MAX_FIELD_LENGTH = 100;

const FACULTY_WHITELIST = [
  'Fakulti Perakaunan',
  'Fakulti Pengurusan Perniagaan',
  'Fakulti Komunikasi & Pengajian Media',
  'Fakulti Sains Komputer & Matematik',
  'Fakulti Undang-Undang',
  'Fakulti Kejuruteraan Awam',
  'Fakulti Kejuruteraan Elektrik',
  'Fakulti Kejuruteraan Mekanikal',
  'Fakulti Sains Gunaan',
  'Fakulti Sains Sukan & Rekreasi',
  'Fakulti Sains Kesihatan',
  'Fakulti Pergigian',
  'Fakulti Farmasi',
  'Fakulti Perubatan',
  'Fakulti Seni Bina, Perancangan & Ukur',
  'Fakulti Seni Lukis & Seni Reka',
  'Fakulti Muzik',
  'Fakulti Pendidikan',
  'Pusat Pengajian Asasi',
  'Lain-lain',
];

const SEMESTER_WHITELIST = [
  'Semester 1', 'Semester 2', 'Semester 3',
  'Semester 4', 'Semester 5', 'Semester 6',
  'Semester 7', 'Semester 8', 'Semester 9', 'Semester 10',
];

// ─── Spreadsheet helpers ───────────────────────────────────────────────────────

function getSpreadsheet() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID tidak ditetapkan dalam Script Properties');
  return SpreadsheetApp.openById(id);
}

function getSheet(name) {
  const sheet = getSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Sheet tidak ditemui: ' + name);
  return sheet;
}

/**
 * Returns all data rows (excluding header) as an array of objects keyed by header name.
 */
function sheetToObjects(sheetName) {
  const sheet = getSheet(sheetName);
  const [headers, ...rows] = sheet.getDataRange().getValues();
  return rows.map(row =>
    headers.reduce((obj, key, i) => { obj[key] = row[i]; return obj; }, {})
  );
}

// ─── Security helpers ──────────────────────────────────────────────────────────

/**
 * Prevents formula injection by prefixing dangerous leading characters with a single quote.
 * Must be applied to EVERY value before inserting into any sheet.
 */
function sanitizeCell(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return /^[=+\-@]/.test(str) ? "'" + str : str;
}

function isUiTMEmail(email) {
  if (!email) return false;
  return UITM_DOMAINS.some(domain => email.toLowerCase().endsWith(domain));
}

function isModerator(email) {
  const mods = sheetToObjects('Moderators');
  return mods.some(m => m.email && m.email.toLowerCase() === email.toLowerCase());
}

function requireModerator(email) {
  if (!isModerator(email)) throw new Error('Akses ditolak: bukan moderator');
}

function truncate(value) {
  const str = String(value || '');
  return str.slice(0, MAX_FIELD_LENGTH);
}

// Robustly coerces a sheet cell (Date object or string) into a Date, or null
function toDate(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function getConfigValue(key) {
  const rows = sheetToObjects('Config');
  const row = rows.find(r => r.key === key);
  return row ? row.value : null;
}

// ─── Response helpers ──────────────────────────────────────────────────────────

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonError(message) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: message }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Verifies a Google ID token via tokeninfo API and returns the verified user.
 * Throws if token is invalid or email is not UiTM domain.
 * @return {{email: string, name: string}}
 */
function verifyToken(idToken) {
  if (!idToken) throw new Error('Token diperlukan. Sila log masuk.');
  const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const info = JSON.parse(resp.getContentText());
  if (info.error_description || !info.email) throw new Error('Token tidak sah. Sila log masuk semula.');
  if (!isUiTMEmail(info.email)) throw new Error('Akses ditolak: email bukan domain UiTM');
  return { email: info.email, name: info.name || '' };
}

function appendAuditLog(actor, action, detail) {
  getSheet('AuditLog').appendRow([
    new Date(),
    sanitizeCell(actor),
    sanitizeCell(action),
    sanitizeCell(truncate(detail)),
  ]);
}
