# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SPEC: Sistem Pendaftaran & Reporting Penglibatan Pelajar (UCS/HEP)**

Zero-cost student participation registration system for UiTM HEP/UCS programs with KPI reporting. No VPS, no database — pure Google Stack.

```
Frontend: GitHub Pages (static HTML/JS)
Backend:  Google Apps Script Web App
Storage:  Google Sheets
Auth:     Google login UiTM (server-side only via Session.getActiveUser())
```

## Architecture Constraints (Non-Negotiable)

- **Frontend is untrusted.** All identity, validation, timestamps, and security decisions happen in Apps Script only. Frontend can be bypassed — that's assumed.
- **CORS workaround:** POST to Apps Script must use `Content-Type: text/plain` to avoid preflight. Standard JSON `Content-Type` headers will fail.
- **No sequential IDs:** `pid` uses `Utilities.getUuid().slice(0,8)` to prevent enumeration.
- **Email always from server:** `student_email` must always come from `Session.getActiveUser().getEmail()`, never from client payload.
- **Dedup key:** `student_email + pid` composite uniqueness enforced at Apps Script level with `LockService.getScriptLock()` around check-then-insert (Sheets is not atomic).

## Google Sheets Schema

| Sheet | Columns |
|---|---|
| `Programs` | pid, name, date, organizer, status (open/closed), created_by, created_at |
| `Participation` | student_email, pid, timestamp |
| `StudentProfiles` | student_email, student_id, name, faculty, semester, updated_at |
| `Moderators` | email, name |
| `Config` | key, value (e.g. total_population = 15000) |
| `AuditLog` | timestamp, actor_email, action, detail |

## Apps Script API Endpoints

| Endpoint | Access | Function |
|---|---|---|
| `getProgram(pid)` | UiTM domain | Return program info only — never return registrant list |
| `getMyProfile()` | UiTM domain | Check if caller has profile |
| `submitParticipation(pid, profile?)` | UiTM domain | Dedup check + LockService + insert |
| `createProgram(data)` | Moderators only | Create program, log to AuditLog, return pid + link |
| `closeProgram(pid)` | Moderators only | Set status closed, log to AuditLog |
| `getKPI()` | Moderators only | KPI 1, KPI 2, faculty/semester breakdown |

Every moderator endpoint **must re-check** `Session.getActiveUser().getEmail()` against the `Moderators` sheet — Apps Script has no session state.

## Security Requirements (All Mandatory)

1. **Formula injection:** `sanitizeCell(value)` — if value starts with `=`, `+`, `-`, `@`, prefix with `'`. Apply to ALL Sheets inserts. Most critical requirement.
2. **XSS:** Frontend must render Sheets data using `textContent`/`createTextNode` only. Never use `innerHTML` for user data. XSS target is the moderator's browser.
3. **Server-side validation:**
   - `pid` exists and status = open before insert
   - Faculty/semester validated against server-side whitelist (hardcoded or Config sheet)
   - All string fields capped at 100 chars
   - Timestamps server-generated only (`new Date()`)
   - Email must end with UiTM domain (defense in depth)
4. **Race condition:** `LockService.getScriptLock()` wrapping check-then-insert in `submitParticipation`
5. **Data exposure:** Student endpoints must not return other students' emails or registrant lists
6. **AuditLog:** Every moderator action (create/close program) must `appendRow(timestamp, actor, action, detail)`

## Frontend Pages (GitHub Pages)

**`register.html`** — Student flow:
- Read `?pid=` from URL → `getProgram(pid)` → show program card
- `getMyProfile()`: returning user → "Daftar Kehadiran" button; first-timer → profile form with dropdowns (not free text) for faculty and semester
- Success → confirmation: program name + "Anda pelajar ke-N mendaftar"
- Already registered → friendly message "Anda telah berdaftar pada [tarikh]" (not an error)
- Must include: "Log masuk Google UiTM diperlukan untuk pengesahan identiti"

**`admin.html`** — Moderator program management:
- Create program form → returns `register.html?pid=xxx` link + QR code (qrcode.js, client-side)
- Program list with registrant count, copy link, close program

**`dashboard.html`** — Moderator KPI view:
- KPI cards + Chart.js bar chart (faculty/semester breakdown) + program list + CSV export

## KPI Formulas

- **KPI 1 (unique reach):** `unique(student_email in Participation) ÷ Config.total_population × 100`
- **KPI 2 (engagement depth):** `% of students involved in ≥2 programs (of those who participated)`
- Breakdown: % per faculty & semester (join Participation ↔ StudentProfiles)
- Only `getKPI()` needs updating when official HEP formula arrives — data structure stays the same

## Build Order (Follow Exactly, Do Not Skip Steps)

1. Sheets setup — 6 sheets per schema, seed 1 moderator + Config total_population
2. Apps Script core — router doGet/doPost, email validation, moderator check, `submitParticipation` with LockService + sanitizeCell. Test dedup manually before touching frontend.
3. `register.html` — complete student end-to-end flow
4. `admin.html` — create program + QR code
5. `dashboard.html` — KPI + charts + CSV export
6. Deploy & smoke test — consent screen UX, dedup race test (2x fast submit), moderator vs non-moderator access, formula injection test (register name `=1+1`), XSS test (name `<script>`)

## Definition of Done

- Dedup proven (manual test + race condition test)
- Formula injection & XSS tests pass
- Non-moderator cannot access moderator endpoints
- Student flow works end-to-end from QR scan → confirmation
- KPI dashboard shows correct figures with test data
