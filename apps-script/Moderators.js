// ─── Moderator endpoints ──────────────────────────────────────────────────────

function createProgram(payload, email) {
  requireModerator(email);

  const { name, date, organizer } = payload;
  if (!name || !date || !organizer) throw new Error('name, date, dan organizer diperlukan');

  const pid = Utilities.getUuid().slice(0, 8);
  const now = new Date();

  getSheet('Programs').appendRow([
    sanitizeCell(pid),
    sanitizeCell(truncate(name)),
    sanitizeCell(truncate(date)),
    sanitizeCell(truncate(organizer)),
    'open',
    sanitizeCell(email),
    now,
  ]);

  appendAuditLog(email, 'createProgram', 'pid=' + pid + ' name=' + name);

  return {
    pid,
    registerLink: '?pid=' + pid,
  };
}

function closeProgram(pid, email) {
  requireModerator(email);
  if (!pid) throw new Error('pid diperlukan');

  const sheet = getSheet('Programs');
  const [headers, ...rows] = sheet.getDataRange().getValues();
  const pidIdx = headers.indexOf('pid');
  const statusIdx = headers.indexOf('status');

  const rowIdx = rows.findIndex(r => r[pidIdx] === pid);
  if (rowIdx === -1) throw new Error('Program tidak ditemui');

  // +2: +1 for 0-based to 1-based, +1 for header row
  sheet.getRange(rowIdx + 2, statusIdx + 1).setValue('closed');

  appendAuditLog(email, 'closeProgram', 'pid=' + pid);

  return { pid, status: 'closed' };
}

function getKPI(email) {
  requireModerator(email);

  const participation = sheetToObjects('Participation');
  const profiles = sheetToObjects('StudentProfiles');
  const programs = sheetToObjects('Programs');
  const totalPopulation = Number(getConfigValue('total_population')) || 1;

  // KPI 1: unique students / total population
  const uniqueEmails = [...new Set(
    participation.map(r => r.student_email).filter(Boolean).map(e => e.toLowerCase())
  )];
  const uniqueCount = uniqueEmails.length;
  const kpi1 = ((uniqueCount / totalPopulation) * 100).toFixed(2);

  // KPI 2: % of participating students who joined ≥2 programs
  const emailProgramCount = {};
  participation.forEach(r => {
    if (!r.student_email) return;
    const e = r.student_email.toLowerCase();
    emailProgramCount[e] = (emailProgramCount[e] || 0) + 1;
  });
  const multiParticipants = Object.values(emailProgramCount).filter(c => c >= 2).length;
  const kpi2 = uniqueCount > 0
    ? ((multiParticipants / uniqueCount) * 100).toFixed(2)
    : '0.00';

  // Breakdown by faculty
  const profileMap = {};
  profiles.forEach(p => {
    if (p.student_email) profileMap[p.student_email.toLowerCase()] = p;
  });

  const facultyCount = {};
  const semesterCount = {};
  uniqueEmails.forEach(e => {
    const p = profileMap[e];
    if (!p) return;
    facultyCount[p.faculty] = (facultyCount[p.faculty] || 0) + 1;
    semesterCount[p.semester] = (semesterCount[p.semester] || 0) + 1;
  });

  const toBreakdown = (counts) =>
    Object.entries(counts)
      .map(([label, count]) => ({
        label,
        count,
        pct: ((count / uniqueCount) * 100).toFixed(2),
      }))
      .sort((a, b) => b.count - a.count);

  // Per-program summary (count only, no email list)
  const programCounts = programs.map(prog => {
    const count = participation.filter(r => r.pid === prog.pid).length;
    return {
      pid: prog.pid,
      name: prog.name,
      date: prog.date,
      organizer: prog.organizer,
      status: prog.status,
      participantCount: count,
    };
  });

  // ── Time breakdown (by program date, fallback to participation timestamp) ──
  const programDateMap = {};
  programs.forEach(p => { programDateMap[p.pid] = toDate(p.date); });

  const MS = ['Jan','Feb','Mac','Apr','Mei','Jun','Jul','Ogo','Sep','Okt','Nov','Dis'];
  const yearCount = {};
  const monthCount = {};
  participation.forEach(r => {
    const d = programDateMap[r.pid] || toDate(r.timestamp);
    if (!d) return;
    const y = d.getFullYear();
    yearCount[y] = (yearCount[y] || 0) + 1;
    const key = y + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
    monthCount[key] = (monthCount[key] || 0) + 1;
  });

  const totalParticipations = participation.length;

  const yearBreakdown = Object.keys(yearCount).sort().map(y => ({
    label: String(y),
    count: yearCount[y],
    pct: totalParticipations ? ((yearCount[y] / totalParticipations) * 100).toFixed(2) : '0.00',
  }));

  const monthBreakdown = Object.keys(monthCount).sort().map(key => {
    const parts = key.split('-');
    return { label: MS[parseInt(parts[1], 10) - 1] + ' ' + parts[0], count: monthCount[key] };
  });

  return {
    kpi1: { value: kpi1, uniqueStudents: uniqueCount, totalPopulation },
    kpi2: { value: kpi2, multiParticipants, totalParticipating: uniqueCount },
    totalParticipations,
    facultyBreakdown: toBreakdown(facultyCount),
    semesterBreakdown: toBreakdown(semesterCount),
    yearBreakdown,
    monthBreakdown,
    programs: programCounts,
  };
}
