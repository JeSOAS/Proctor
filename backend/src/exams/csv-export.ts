// Builds the exam CSV exports so they read like the dashboard.
//
// The labels below are copied from dashboard/src/ui.tsx (EVENT_LABELS and
// endedReasonLabel); keep them in sync. The rows themselves come from
// common/timeline.ts, which also feeds the dashboard's per-student log.

import { classify, ClassifiableEvent } from '../common/concerning';
import { buildTimeline, fmtGap } from '../common/timeline';

const EVENT_LABELS: Record<string, string> = {
  TAB_NAVIGATE: 'Opened a page',
  TAB_SWITCH: 'Switched browser tab',
  TAB_CREATED: 'Opened a new tab',
  TAB_CLOSED: 'Closed a tab',
  NEW_WINDOW: 'Opened a new window',
  FULLSCREEN_EXIT: 'Left fullscreen',
  IDLE: 'Went idle (no activity)',
  WINDOW_BLUR: 'Left the Chrome window',
  WINDOW_FOCUS: 'Returned to Chrome',
  COPY: 'Copied text',
  CUT: 'Cut text',
  PASTE: 'Pasted from clipboard',
  LONG_DISCONNECT: 'Disconnected for a while',
  RECONNECT: 'Reconnected',
  REJOIN: 'Re-joined the exam',
  EXAM_STARTED: 'Opened the exam',
  EXAM_SUBMITTED: 'Submitted the exam',
  SUBMISSION_CONFIRMED: 'Submission confirmed (form)',
  ID_CONFLICT: 'Someone else tried to join with this ID',
  NAME_MISMATCH: 'Re-joined with a different name',
  INCOGNITO_DISABLED: 'Turned off Proctor in incognito',
  LEFT_CHROME: 'Left Chrome (did not return)',
  EXTENSION_SETTINGS: 'Opened extension settings',
  INCOGNITO_WINDOW: 'Opened an incognito window',
};
const eventLabel = (type: string) => EVENT_LABELS[type] || type;

export function endedReasonLabel(reason?: string | null): string {
  switch (reason) {
    case 'LEFT':
      return 'Left the exam';
    case 'FINISHED_FULLSCREEN':
      return 'Finished (fullscreen)';
    case 'EXAM_CLOSED':
      return 'Exam ended';
    case 'AUTO_CLOSED':
      return 'Reached warning limit';
    case 'TIMEOUT':
      return 'Disconnected (unexpected)';
    case 'NO_SESSION':
      return 'Form submitted, never joined Proctor';
    default:
      return 'Ended';
  }
}


/// "2026-09-17 09:20:05" in the given IANA time zone (spreadsheets parse it as
/// a date-time). Falls back to UTC for a missing/unknown zone.
function timeFormatter(tz?: string) {
  let zone = 'UTC';
  if (tz) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      zone = tz;
    } catch {
      /* unknown zone — keep UTC */
    }
  }
  const f = new Intl.DateTimeFormat('sv-SE', {
    timeZone: zone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  return { zone, fmt: (d?: Date | null) => (d ? f.format(d) : '') };
}

function toCsv(rows: unknown[][]): string {
  const esc = (v: unknown) => {
    let s = v == null ? '' : String(v);
    // CSV formula injection: Excel runs a cell that starts with = + - @ (or a
    // tab / carriage return) as a formula. Names are typed by students, so such
    // cells get a leading apostrophe and are shown as plain text.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  // BOM so Excel opens it as UTF-8 (Thai and other non-Latin names).
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

type SessionWithEvents = {
  studentName: string;
  studentId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  endedReason: string | null;
  violations: (ClassifiableEvent & { payload: string | null })[];
};

/// Full log: one readable row per event, as in the dashboard's per-student log
/// (common/timeline.ts), framed by "Joined" (always first) and "Ended" (always
/// last). Event times come from the student's clock and the join/end times from
/// the server's, so a slightly slow laptop must not put events before the join.
export function buildLogCsv(
  sessions: SessionWithEvents[],
  opts: { examLink: string | null; awayGraceSec?: number | null },
  tz?: string,
): string {
  const { zone, fmt } = timeFormatter(tz);
  const rows: unknown[][] = [[`Time (${zone})`, 'Student', 'Student ID', 'Event', 'Details', 'Counts as violation']];
  for (const s of sessions) {
    const who = [s.studentName, s.studentId ?? ''];
    const timeline = buildTimeline(s.violations, classify(s.violations, opts), opts);
    if (s.endedReason !== 'NO_SESSION') rows.push([fmt(s.startedAt), ...who, 'Joined the exam', '', '']);
    for (const e of timeline) {
      const label = e.kind === 'AWAY' ? `Away from Chrome for ${fmtGap(e.seconds ?? 0)}` : eventLabel(e.kind);
      const counts = e.concerning ? 'Yes' : e.postSubmission ? 'No (after submitting)' : 'No';
      rows.push([fmt(e.at), ...who, label, e.detail, counts]);
    }
    if (s.endedAt) rows.push([fmt(s.endedAt), ...who, `Ended: ${endedReasonLabel(s.endedReason)}`, '', '']);
  }
  return toCsv(rows);
}

/// Summary: one row per student with the same counts and flags as the dashboard.
export function buildSummaryCsv(
  rows: {
    studentName: string;
    studentId: string | null;
    startedAt: Date;
    endedAt: Date | null;
    endedReason: string | null;
    concerningCount: number;
    aiUsed: boolean;
    tamperIntent: boolean;
    didNotOpenExam: boolean;
    submissionConfirmed: boolean;
    submittedAt: Date | null;
    startedLate: boolean;
    finishedEarly: boolean;
    idle: boolean;
    reconnectCount: number;
    unaccountedSec: number;
    idConflict: boolean;
    nameMismatch: boolean;
    _count?: { violations: number };
  }[],
  maxWarnings: number,
  tz?: string,
): string {
  const { zone, fmt } = timeFormatter(tz);
  const out: unknown[][] = [[
    'Student', 'Student ID', `Joined (${zone})`, `Ended (${zone})`, 'How it ended',
    'Violations', 'Warning limit', 'Assessment', 'Submitted', 'Flags', 'Events recorded',
  ]];
  for (const s of rows) {
    const flags = [
      s.aiUsed && 'AI used',
      s.tamperIntent && 'Opened extension settings',
      s.didNotOpenExam && 'Did not open exam',
      s.startedLate && 'Started late',
      s.finishedEarly && 'Finished early',
      s.idle && 'Went idle',
      s.reconnectCount > 2 && `Reconnected ${s.reconnectCount}x`,
      s.unaccountedSec >= 60 && `${fmtGap(s.unaccountedSec)} unaccounted`,
      s.idConflict && 'ID also used by someone else',
      s.nameMismatch && 'Different name on re-join',
      s.endedReason === 'NO_SESSION' && 'Submitted, but no Proctor session with this ID',
    ].filter(Boolean);
    const assessment =
      s.concerningCount > maxWarnings ? 'Very high chance of cheating'
        : s.concerningCount >= maxWarnings ? 'At warning limit'
          : s.concerningCount > 0 ? 'Below limit' : 'No violations';
    const submitted = s.submissionConfirmed ? 'Confirmed by form' : s.submittedAt ? 'Detected by extension' : '';
    out.push([
      s.studentName, s.studentId ?? '', s.endedReason === 'NO_SESSION' ? '' : fmt(s.startedAt), fmt(s.endedAt),
      s.endedAt ? endedReasonLabel(s.endedReason) : 'Still in exam',
      s.concerningCount, maxWarnings, assessment, submitted, flags.join('; '), s._count?.violations ?? 0,
    ]);
  }
  return toCsv(out);
}
