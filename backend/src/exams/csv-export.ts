// Builds the exam CSV exports so they read like the dashboard.
//
// The labels below are copied from dashboard/src/ui.tsx (EVENT_LABELS and
// endedReasonLabel) and the log logic mirrors buildLogRows in
// dashboard/src/components/SessionsPanel.tsx. Keep them in sync when either
// side changes.

import { classify, ClassifiableEvent } from '../common/concerning';

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

const fmtGap = (sec: number) => {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
};

/// "2026-09-17 09:20:05" in the given IANA time zone (spreadsheets parse it as
/// a date-time). Falls back to UTC for a missing/unknown zone.
export function timeFormatter(tz?: string) {
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
    const s = v == null ? '' : String(v);
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

const parsePayload = (p: string | null): any => {
  try {
    return p ? JSON.parse(p) : null;
  } catch {
    return null;
  }
};

/// Full log: one readable row per event, framed by "Joined" / "Ended" rows,
/// with window blur+focus merged into "Away from Chrome for …" as on screen.
export function buildLogCsv(
  sessions: SessionWithEvents[],
  opts: { examLink: string | null; awayGraceSec?: number | null },
  tz?: string,
): string {
  const { zone, fmt } = timeFormatter(tz);
  const rows: unknown[][] = [[`Time (${zone})`, 'Student', 'Student ID', 'Event', 'Details', 'Counts as violation']];
  for (const s of sessions) {
    const who = [s.studentName, s.studentId ?? ''];
    const r = classify(s.violations, opts);
    const counts = (id: number) =>
      r.concerning.has(id) ? 'Yes' : r.postSubmission.has(id) ? 'No (after submitting)' : 'No';
    // Collected per student and sorted by time before writing: a merged "Away
    // from Chrome" row is only known when the student returns, but belongs at
    // the moment they left. (sort is stable, so equal times keep their order.)
    const mine: { at: Date; cells: unknown[] }[] = [];
    const add = (at: Date, event: string, details: string, count: string) =>
      mine.push({ at, cells: [fmt(at), ...who, event, details, count] });

    if (s.endedReason !== 'NO_SESSION') add(s.startedAt, 'Joined the exam', '', '');
    let pendingBlur: (typeof s.violations)[number] | null = null;
    for (const v of s.violations) {
      const payload = parsePayload(v.payload);
      switch (v.type) {
        case 'WINDOW_BLUR':
          pendingBlur = v;
          break;
        case 'WINDOW_FOCUS':
          if (pendingBlur) {
            const secs = Math.round((v.occurredAt.getTime() - pendingBlur.occurredAt.getTime()) / 1000);
            add(pendingBlur.occurredAt, `Away from Chrome for ${fmtGap(secs)}`, pendingBlur.url || '', counts(pendingBlur.id));
            pendingBlur = null;
          }
          break;
        case 'ID_CONFLICT':
          add(v.occurredAt, eventLabel(v.type), `name entered: "${payload?.attemptedName ?? '?'}"`, counts(v.id));
          break;
        case 'NAME_MISMATCH':
          add(v.occurredAt, eventLabel(v.type), `name entered: "${payload?.typedName ?? '?'}"`, counts(v.id));
          break;
        case 'LONG_DISCONNECT':
        case 'RECONNECT':
          add(v.occurredAt, eventLabel(v.type), payload?.seconds != null ? `offline ${fmtGap(payload.seconds)}` : '', counts(v.id));
          break;
        default: {
          const ext = /^(chrome|edge):\/\/extensions/i.test(v.url || '');
          add(v.occurredAt, ext ? 'Opened extension settings' : eventLabel(v.type), v.url || '', counts(v.id));
        }
      }
    }
    if (pendingBlur) add(pendingBlur.occurredAt, 'Left Chrome (did not return)', pendingBlur.url || '', counts(pendingBlur.id));
    if (s.endedAt) add(s.endedAt, `Ended: ${endedReasonLabel(s.endedReason)}`, '', '');
    mine.sort((a, b) => a.at.getTime() - b.at.getTime());
    for (const m of mine) rows.push(m.cells);
  }
  return toCsv(rows);
}

/// Summary: one row per student with the same counts and flags as the dashboard.
export function buildSummaryCsv(
  rows: {
    studentName: string;
    studentId: string | null;
    status: string;
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
