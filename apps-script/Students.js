// ─── Student endpoints ────────────────────────────────────────────────────────

function getProgram(pid) {
  if (!pid) throw new Error('pid diperlukan');

  const programs = sheetToObjects('Programs');
  const program = programs.find(p => p.pid === pid);
  if (!program) throw new Error('Program tidak ditemui');

  // Never return registrant list to students
  return {
    pid: program.pid,
    name: program.name,
    date: program.date,
    organizer: program.organizer,
    status: program.status,
  };
}

function getMyProfile(email) {
  const profiles = sheetToObjects('StudentProfiles');
  const profile = profiles.find(p => p.student_email && p.student_email.toLowerCase() === email.toLowerCase());
  if (!profile) return { hasProfile: false };

  return {
    hasProfile: true,
    name: profile.name,
    student_id: profile.student_id,
    faculty: profile.faculty,
    semester: profile.semester,
  };
}

/**
 * Core dedup + insert function.
 * profile is required only for first-time registrants (when student has no existing StudentProfile).
 * Uses LockService to prevent race-condition double-registration.
 */
function submitParticipation(pid, profile, email, verifiedName) {
  if (!pid) throw new Error('pid diperlukan');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // wait up to 10s, throws if cannot acquire

  try {
    const ss = getSpreadsheet();

    // 1. Validate program exists and is open
    const programSheet = ss.getSheetByName('Programs');
    const [pHeaders, ...pRows] = programSheet.getDataRange().getValues();
    const pidIdx = pHeaders.indexOf('pid');
    const statusIdx = pHeaders.indexOf('status');
    const nameIdx = pHeaders.indexOf('name');

    const programRow = pRows.find(r => r[pidIdx] === pid);
    if (!programRow) throw new Error('Program tidak ditemui');
    if (programRow[statusIdx] !== 'open') throw new Error('Program telah ditutup');
    const programName = programRow[nameIdx];

    // 2. Check for duplicate registration
    const participationSheet = ss.getSheetByName('Participation');
    const [partHeaders, ...partRows] = participationSheet.getDataRange().getValues();
    const emailIdx = partHeaders.indexOf('student_email');
    const pidPartIdx = partHeaders.indexOf('pid');
    const tsIdx = partHeaders.indexOf('timestamp');

    const existing = partRows.find(
      r => r[emailIdx] && r[emailIdx].toLowerCase() === email.toLowerCase() && r[pidPartIdx] === pid
    );
    if (existing) {
      return {
        status: 'already_registered',
        message: 'Anda telah berdaftar pada ' + formatDate(existing[tsIdx]),
        programName,
      };
    }

    // 3. Upsert StudentProfile if this is first-timer or profile update
    const profileSheet = ss.getSheetByName('StudentProfiles');
    const [profHeaders, ...profRows] = profileSheet.getDataRange().getValues();
    const profEmailIdx = profHeaders.indexOf('student_email');

    const existingProfileIdx = profRows.findIndex(
      r => r[profEmailIdx] && r[profEmailIdx].toLowerCase() === email.toLowerCase()
    );

    if (existingProfileIdx === -1) {
      // New student — profile data is required.
      // Name is taken from the verified token, never from the client payload.
      if (!profile || !profile.student_id || !profile.faculty || !profile.semester) {
        throw new Error('Profil pelajar diperlukan untuk pendaftaran pertama');
      }
      if (!verifiedName) throw new Error('Nama tidak dapat disahkan dari akaun Google');
      validateProfile(profile);

      profileSheet.appendRow([
        sanitizeCell(email),
        sanitizeCell(truncate(profile.student_id)),
        sanitizeCell(truncate(verifiedName)),  // from verified token, not client
        sanitizeCell(profile.faculty),         // already validated against whitelist
        sanitizeCell(profile.semester),        // already validated against whitelist
        new Date(),
      ]);
    }

    // 4. Insert participation record
    participationSheet.appendRow([
      sanitizeCell(email),
      sanitizeCell(pid),
      new Date(),
    ]);

    // 5. Return count of unique participants for this program (for "ke-N" message)
    const updatedPart = participationSheet.getDataRange().getValues();
    const updatedRows = updatedPart.slice(1); // skip header
    const count = updatedRows.filter(r => r[pidPartIdx] === pid).length;

    return {
      status: 'registered',
      programName,
      participantCount: count,
    };

  } finally {
    lock.releaseLock();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validateProfile(profile) {
  if (!FACULTY_WHITELIST.includes(profile.faculty)) {
    throw new Error('Fakulti tidak sah');
  }
  if (!SEMESTER_WHITELIST.includes(profile.semester)) {
    throw new Error('Semester tidak sah');
  }
  if (!profile.student_id || !/^\d{9,12}$/.test(profile.student_id)) {
    throw new Error('No matrik tidak sah');
  }
}

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return Utilities.formatDate(d, 'Asia/Kuala_Lumpur', 'dd/MM/yyyy HH:mm');
}
