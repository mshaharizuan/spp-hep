# SPEC: Sistem Pendaftaran & Reporting Penglibatan Pelajar (UCS/HEP)

> Dokumen ini adalah spec lengkap untuk dibina oleh Claude Sonnet. Ikut urutan build di Seksyen 7. Semua keputusan design dah muktamad — jangan tambah feature atau ubah architecture tanpa arahan.

## 1. Objektif

Sistem pendaftaran penglibatan pelajar dalam program HEP/UCS untuk tujuan reporting KPI, dengan jaminan **tiada double-counting** (1 program = 1 unique student; 1 student boleh join banyak program). Zero kos, zero VPS.

## 2. Architecture

```
Frontend: GitHub Pages (static HTML/JS)
Backend:  Google Apps Script Web App
          - Execute as: "User accessing the web app"
          - Access: "Anyone within [domain UiTM]"
Storage:  Google Sheets
Auth:     Google login UiTM (email dari Session.getActiveUser(), server-side sahaja)
```

Prinsip utama: **frontend hanyalah UI. Semua keputusan keselamatan, identity, validation, dan timestamp ditentukan di Apps Script.** Frontend boleh di-bypass — itu diandaikan.

## 3. Struktur Google Sheets

| Sheet | Kolum |
|---|---|
| `Programs` | pid, name, date, organizer, status (open/closed), created_by, created_at |
| `Participation` | student_email, pid, timestamp |
| `StudentProfiles` | student_email, student_id, name, faculty, semester, updated_at |
| `Moderators` | email, name |
| `Config` | key, value (cth: total_population = 15000) |
| `AuditLog` | timestamp, actor_email, action, detail |

Nota:
- `pid` = random short ID: `Utilities.getUuid().slice(0,8)` — BUKAN sequential (elak enumeration)
- Dedup key: `student_email + pid` (unik)
- `student_email` sentiasa dari `Session.getActiveUser().getEmail()`, JANGAN dari payload client

## 4. API Endpoints (Apps Script)

| Endpoint | Akses | Fungsi |
|---|---|---|
| `getProgram(pid)` | domain UiTM | Return info program untuk paparan form. Jangan return senarai peserta. |
| `getMyProfile()` | domain UiTM | Check caller ada profil (first-timer atau tidak) |
| `submitParticipation(pid, profile?)` | domain UiTM | Dedup check + LockService + insert. Return status + count peserta sahaja. |
| `createProgram(data)` | Moderators | Wujud program, log ke AuditLog, return pid + link |
| `closeProgram(pid)` | Moderators | Set status closed, log ke AuditLog |
| `getKPI()` | Moderators | KPI 1, KPI 2, breakdown fakulti/sem, count per program |

**Setiap endpoint moderator MESTI re-check** `Session.getActiveUser().getEmail()` terhadap sheet `Moderators` — Apps Script takde session state, jangan assume "dah login".

## 5. Security Requirements (WAJIB)

1. **Formula injection ke Sheets** — helper `sanitizeCell(value)`: jika value bermula dengan `=`, `+`, `-`, `@`, prefix dengan `'`. Guna untuk SEMUA insert ke mana-mana sheet. *Paling kritikal.*
2. **XSS di dashboard/admin** — frontend WAJIB render data dari Sheets guna `textContent`/`createTextNode`. JANGAN guna `innerHTML` untuk data pengguna. Target sebenar XSS ialah browser moderator.
3. **Server-side validation semua input:**
   - `pid` wujud & status = open sebelum insert
   - Fakulti/semester: validate terhadap whitelist server-side (senarai hardcode atau sheet Config)
   - Cap panjang semua string field: 100 char
   - Timestamp: server-generated sahaja (`new Date()`)
   - Email: double-check ends with domain UiTM (defense in depth walaupun access dah restricted)
4. **Race condition dedup** — `LockService.getScriptLock()` sekeliling check-then-insert dalam `submitParticipation`. Sheets check-then-insert bukan atomic.
5. **Data exposure** — response student endpoints tak boleh mengandungi email/senarai pendaftar lain. Senarai peserta hanya melalui endpoint moderator.
6. **AuditLog** — setiap action moderator (create/close program): satu `appendRow` (timestamp, actor, action, detail).
7. **Throttle (optional, tambah kemudian jika perlu)** — `CacheService` per-user: max 1 submit per 10 saat.

**Tak perlu handle:** SQL injection (takde SQL), password storage (Google auth), HTTPS (enforced), API keys (takde).

## 6. Frontend Pages (GitHub Pages)

### `register.html` (student)
- Baca `?pid=` dari URL → `getProgram(pid)` → papar kad program (nama, tarikh, anjuran)
- `getMyProfile()`: kalau profil wujud → satu butang "Daftar Kehadiran"; first-timer → form profil (student_id, nama, fakulti & semester sebagai **dropdown**, bukan free text)
- Lepas submit berjaya → confirmation screen: nama program + "Anda pelajar ke-N mendaftar"
- Kalau dah daftar → papar "Anda telah berdaftar pada [tarikh]" (mesej mesra, bukan error)
- Landing perlu ada ayat: "Log masuk Google UiTM diperlukan untuk pengesahan identiti" (sebab consent screen Google akan muncul kali pertama)

### `admin.html` (moderator)
- Form create program → dapat balik link `register.html?pid=xxx` + **QR code** (qrcode.js, client-side) untuk paparan skrin masa program fizikal
- Senarai program + count peserta + butang copy link + butang close program

### `dashboard.html` (moderator)
- KPI cards + Chart.js bar chart breakdown fakulti/sem + senarai program + export CSV

## 7. Urutan Build (ikut turutan, jangan langkau)

1. **Sheets setup** — 6 sheets ikut Seksyen 3, seed 1 moderator + config total_population
2. **Apps Script core** — router doGet/doPost, email validation, moderator check, `submitParticipation` dengan LockService + sanitizeCell. **Siapkan & test dedup manual dulu sebelum sentuh frontend.**
3. **register.html** — flow student end-to-end
4. **admin.html** — create program + QR
5. **dashboard.html** — KPI + charts + CSV export
6. **Deploy & smoke test** — consent screen experience, dedup race (2x submit pantas), moderator vs non-moderator access, formula injection test (daftar nama `=1+1`), XSS test (nama `<script>`)

## 8. KPI (default sementara — tunggu wording rasmi HEP)

- **KPI 1 (unique reach):** unique student_email dalam Participation ÷ Config.total_population × 100
- **KPI 2 (engagement depth):** % pelajar terlibat dalam ≥2 program (daripada pelajar yang terlibat)
- Breakdown: % per fakulti & per semester (join Participation ↔ StudentProfiles)
- Bila formula rasmi HEP sampai: hanya `getKPI()` perlu diubah — struktur data tak berubah

## 9. Nota Teknikal untuk Build

- **CORS:** POST ke Apps Script guna `Content-Type: text/plain` (elak preflight). Jangan buang masa dengan standard JSON headers — akan gagal.
- **Consent screen Google** kali pertama pengguna — normal untuk internal unverified app, dah dihandle dengan ayat penjelasan di register.html.
- **Quota Apps Script** — jauh mencukupi untuk skala PTJ.
- **Scaling** — Sheets memadai untuk skala PTJ (ribuan records). Migrate hanya jika guna seluruh universiti.

## 10. Definition of Done

- Dedup terbukti (test manual + race test)
- Formula injection & XSS test lulus
- Non-moderator TAK boleh akses endpoint moderator
- Student flow lancar dari QR scan → confirmation
- KPI dashboard papar angka betul dengan data test
