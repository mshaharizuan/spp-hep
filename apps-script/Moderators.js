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

const MS_LABELS = ['Jan','Feb','Mac','Apr','Mei','Jun','Jul','Ogo','Sep','Okt','Nov','Dis'];

function getKPI(email) {
  requireModerator(email);

  const participation = sheetToObjects('Participation');
  const profiles = sheetToObjects('StudentProfiles');
  const programs = sheetToObjects('Programs');
  const totalPopulation = Number(getConfigValue('total_population')) || 1;

  const profileMap = {};
  profiles.forEach(p => {
    if (p.student_email) profileMap[p.student_email.toLowerCase()] = p;
  });

  const programMap = {};
  programs.forEach(p => { programMap[p.pid] = p; });

  // Attach a resolved year/month to each participation (by program date, fallback timestamp)
  const records = participation.map(r => {
    const prog = programMap[r.pid];
    const d = (prog && toDate(prog.date)) || toDate(r.timestamp);
    return {
      email: r.student_email ? r.student_email.toLowerCase() : '',
      pid: r.pid,
      year: d ? d.getFullYear() : null,
      monthKey: d ? d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) : null,
    };
  });

  const years = [...new Set(records.map(r => r.year).filter(y => y !== null))].sort();

  // Year overview chart (always across all years)
  const yearBreakdown = years.map(y => {
    const count = records.filter(r => r.year === y).length;
    return {
      label: String(y),
      count,
      pct: records.length ? ((count / records.length) * 100).toFixed(2) : '0.00',
    };
  });

  // Compute full stats for a subset of records + their programs
  function computeStats(recs, progs) {
    const uniqueEmails = [...new Set(recs.map(r => r.email).filter(Boolean))];
    const uniqueCount = uniqueEmails.length;
    const kpi1 = ((uniqueCount / totalPopulation) * 100).toFixed(2);

    const emailProgramCount = {};
    recs.forEach(r => {
      if (r.email) emailProgramCount[r.email] = (emailProgramCount[r.email] || 0) + 1;
    });
    const multi = Object.values(emailProgramCount).filter(c => c >= 2).length;
    const kpi2 = uniqueCount > 0 ? ((multi / uniqueCount) * 100).toFixed(2) : '0.00';

    const facultyCount = {};
    const semesterCount = {};
    uniqueEmails.forEach(e => {
      const p = profileMap[e];
      if (!p) return;
      facultyCount[p.faculty] = (facultyCount[p.faculty] || 0) + 1;
      semesterCount[p.semester] = (semesterCount[p.semester] || 0) + 1;
    });

    const monthCount = {};
    recs.forEach(r => {
      if (r.monthKey) monthCount[r.monthKey] = (monthCount[r.monthKey] || 0) + 1;
    });

    const toBreakdown = (counts) =>
      Object.entries(counts)
        .map(([label, count]) => ({
          label,
          count,
          pct: uniqueCount ? ((count / uniqueCount) * 100).toFixed(2) : '0.00',
        }))
        .sort((a, b) => b.count - a.count);

    const monthBreakdown = Object.keys(monthCount).sort().map(key => {
      const parts = key.split('-');
      return { label: MS_LABELS[parseInt(parts[1], 10) - 1] + ' ' + parts[0], count: monthCount[key] };
    });

    const programCounts = progs.map(prog => ({
      pid: prog.pid,
      name: prog.name,
      date: prog.date,
      organizer: prog.organizer,
      status: prog.status,
      participantCount: recs.filter(r => r.pid === prog.pid).length,
    }));

    return {
      kpi1: { value: kpi1, uniqueStudents: uniqueCount, totalPopulation },
      kpi2: { value: kpi2, multiParticipants: multi, totalParticipating: uniqueCount },
      totalParticipations: recs.length,
      facultyBreakdown: toBreakdown(facultyCount),
      semesterBreakdown: toBreakdown(semesterCount),
      monthBreakdown,
      programs: programCounts,
    };
  }

  const all = computeStats(records, programs);

  const byYear = {};
  years.forEach(y => {
    const recs = records.filter(r => r.year === y);
    const progs = programs.filter(p => {
      const d = toDate(p.date);
      return d && d.getFullYear() === y;
    });
    byYear[y] = computeStats(recs, progs);
  });

  return {
    years,
    yearBreakdown,
    all,
    byYear,
  };
}
