import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import {
  HelpIcon,
  JoinCode,
  NoExamBadge,
  SearchBar,
  StatusPill,
  TimingBadges,
  WarningBadge,
  btn,
  endedReasonLabel,
  eventLabel,
} from '../ui';
import { ExamSettings } from './ExamSettings';

const fmt = (d?: string) => (d ? new Date(d).toLocaleString() : null);
const time = (d?: string) => (d ? new Date(d).toLocaleTimeString() : null);
const range = (a?: string, b?: string) => {
  const s = fmt(a);
  const e = fmt(b);
  if (!s && !e) return '—';
  return `${s || '—'} → ${e || 'ongoing'}`;
};
const fmtGap = (sec?: number) => {
  if (sec == null) return '';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
};

const hostOf = (u?: string) => {
  if (!u) return '';
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
};

type LogRow = {
  key: string;
  label: string;
  time: string;
  detail: string;
  fullUrl?: string;
  concerning: boolean;
  postSubmission: boolean;
  tone: 'exam' | 'plain';
};

// Turn raw events into readable rows: merge each window blur with the focus that
// follows it into one "Away from Chrome for X" line, label everything in plain
// English, and carry the counts/post-submission flags for display.
function buildLogRows(violations: any[]): LogRow[] {
  const rows: LogRow[] = [];
  let pendingBlur: any = null;

  const away = (blur: any, secs?: number) =>
    rows.push({
      key: `away-${blur.id}`,
      label: secs == null ? 'Left Chrome (did not return)' : `Away from Chrome for ${fmtGap(secs)}`,
      time: new Date(blur.occurredAt).toLocaleTimeString(),
      detail: hostOf(blur.url),
      fullUrl: blur.url || undefined,
      concerning: !!blur.concerning,
      postSubmission: !!blur.postSubmission,
      tone: 'plain',
    });

  const push = (v: any, detail: string, tone: LogRow['tone']) =>
    rows.push({
      key: String(v.id),
      label: eventLabel(v.type),
      time: new Date(v.occurredAt).toLocaleTimeString(),
      detail,
      fullUrl: v.url || undefined,
      concerning: !!v.concerning,
      postSubmission: !!v.postSubmission,
      tone,
    });

  for (const v of violations) {
    switch (v.type) {
      case 'WINDOW_BLUR':
        pendingBlur = v;
        break;
      case 'WINDOW_FOCUS':
        if (pendingBlur) {
          const secs = Math.round(
            (new Date(v.occurredAt).getTime() - new Date(pendingBlur.occurredAt).getTime()) / 1000,
          );
          away(pendingBlur, secs);
          pendingBlur = null;
        }
        break;
      case 'EXAM_STARTED':
      case 'EXAM_SUBMITTED':
        push(v, hostOf(v.url), 'exam');
        break;
      case 'LONG_DISCONNECT':
      case 'RECONNECT':
        push(v, v.payload?.seconds != null ? `offline ${fmtGap(v.payload.seconds)}` : '', 'plain');
        break;
      default:
        push(v, hostOf(v.url), 'plain');
    }
  }
  if (pendingBlur) away(pendingBlur);
  return rows;
}

export function SessionsPanel({ exam }: { exam: any }) {
  const [status, setStatus] = useState<string>(exam.status);
  const [sessions, setSessions] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [violations, setViolations] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  // Kept in sync with the settings panel so the warning badges use the live max.
  const [max, setMax] = useState<number>(exam.maxWarnings ?? 3);

  // The poll reads the currently expanded session through a ref so refreshing
  // the open event log never forces the 5s timer to restart on every expand.
  const expandedRef = useRef<string | null>(null);
  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  // Refs to each student card, so opening one scrolls it into view instead of
  // leaving the page parked where the previous (possibly long) log was.
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const load = useCallback(async () => {
    try {
      setSessions(await api.examSessions(exam.id));
      setError('');
      // If a student's log is open, refresh it too so "live" actually stays
      // live (otherwise the expanded events freeze until you re-click).
      const openId = expandedRef.current;
      if (openId) setViolations(await api.sessionViolations(openId));
    } catch (e: any) {
      setError(e.message);
    }
  }, [exam.id]);

  // Live refresh, but well-behaved:
  //   - skip polling while the tab is hidden (no wasted load on the VM), and
  //     refresh immediately when the instructor switches back;
  //   - self-scheduling timer: the next poll is queued only after the current
  //     one resolves, so a slow response can't let requests stack up.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!document.hidden) await load();
      if (!cancelled) timer = setTimeout(tick, 5000);
    };
    tick();
    const onVisible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  async function changeStatus(next: string) {
    try {
      await api.setExamStatus(exam.id, next);
      setStatus(next);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function toggleViolations(id: string) {
    if (expanded === id) return setExpanded(null);
    setExpanded(id);
    setViolations([]);
    // Align the page to the student just opened (#4).
    requestAnimationFrame(() =>
      rowRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
    try {
      setViolations(await api.sessionViolations(id));
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function removeSession(id: string) {
    if (!confirm('Delete this student session and its events?')) return;
    try {
      await api.deleteSession(id);
      if (expanded === id) setExpanded(null);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  const filtered = sessions.filter((s) =>
    `${s.studentName} ${s.studentId || ''}`.toLowerCase().includes(q.toLowerCase()),
  );

  const scheduled = !!(exam.startsAt || exam.endsAt);
  const examClosed = status === 'CLOSED';

  return (
    <section>
      {/* Header: join code + open/close */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 dark:text-gray-400">Join code</span>
          <JoinCode code={exam.joinCode} />
          <span className={`text-xs px-2 py-0.5 rounded-full ${status === 'OPEN' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
            {status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {status !== 'OPEN' && (
            <button onClick={() => changeStatus('OPEN')} className={btn.success}>
              Open
            </button>
          )}
          {status !== 'CLOSED' && (
            <button onClick={() => changeStatus('CLOSED')} className={btn.neutral}>
              Close
            </button>
          )}
        </div>
      </div>

      {/* Exam info */}
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 grid gap-1 sm:grid-cols-2">
        <div>Type: <span className="text-gray-700 dark:text-gray-300">{scheduled ? 'Scheduled' : 'Manual'}</span></div>
        <div>
          Students: <span className="text-gray-700 dark:text-gray-300">
            {sessions.length} joined{typeof exam.expectedStudents === 'number' ? ` / ${exam.expectedStudents} expected` : ''}
          </span>
        </div>
        <div>Max warnings: <span className="text-gray-700 dark:text-gray-300">{max}</span></div>
        <div>Planned: <span className="text-gray-700 dark:text-gray-300">{range(exam.startsAt, exam.endsAt)}</span></div>
        <div>Actual: <span className="text-gray-700 dark:text-gray-300">{range(exam.openedAt, exam.closedAt)}</span></div>
        <div>Created: <span className="text-gray-700 dark:text-gray-300">{fmt(exam.createdAt) || '—'}</span></div>
        {exam.examLink && (
          <div className="sm:col-span-2 truncate">
            Exam link: <a href={exam.examLink} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">{exam.examLink}</a>
          </div>
        )}
      </div>

      {/* Advanced settings (collapsed by default) */}
      <div className="mb-4">
        <ExamSettings exam={exam} onSaved={(u) => setMax(u.maxWarnings)} />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}

      <SearchBar value={q} onChange={setQ} placeholder="Search students…" />
      <div className="flex items-center gap-3 mb-2">
        <button onClick={load} className={btn.neutral}>
          Refresh
        </button>
        <span className="text-xs text-gray-400 dark:text-gray-500 inline-flex items-center gap-1">
          Live — refreshes every 5s
          <HelpIcon text="Click a student to expand their detailed event log — live during the exam, or as a recording after it's closed." />
        </span>
      </div>

      <div className="grid gap-2">
        {filtered.map((s) => (
          <div
            key={s.id}
            ref={(el) => {
              rowRefs.current[s.id] = el;
            }}
            className="scroll-mt-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
          >
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <button className="text-left min-w-0" onClick={() => toggleViolations(s.id)}>
                <div className="font-medium flex flex-wrap items-center gap-2">
                  <StatusPill session={s} examClosed={examClosed} />
                  <span className="text-gray-900 dark:text-gray-100">{s.studentName}</span>
                  <WarningBadge count={s.concerningCount ?? 0} max={max} aiUsed={s.aiUsed} />
                  <NoExamBadge show={s.didNotOpenExam} />
                  <TimingBadges late={s.startedLate} early={s.finishedEarly} />
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {s.studentId || 'no ID'} · joined {time(s.startedAt)}
                  {s.endedAt && <> · {endedReasonLabel(s.endedReason)} {time(s.endedAt)}</>}
                  {' '}· seen {time(s.lastSeenAt)} · {s._count?.violations ?? 0} event(s)
                </div>
              </button>
              <button onClick={() => removeSession(s.id)} className={`${btn.danger} shrink-0`}>
                Delete
              </button>
            </div>

            {expanded === s.id && (
              <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-2 bg-gray-50 dark:bg-gray-900/40">
                <div className="text-xs py-1 flex items-center gap-2">
                  <span className="font-mono font-semibold px-2 py-0.5 rounded w-32 shrink-0 text-center bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                    LOGON
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">joined at {time(s.startedAt)}</span>
                </div>
                {violations.length === 0 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 py-1">No events recorded.</p>
                )}
                <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                  {buildLogRows(violations).map((row) => (
                    <li
                      key={row.key}
                      className={`py-1.5 flex items-center gap-2 text-xs ${row.postSubmission ? 'opacity-60' : ''}`}
                    >
                      <span className="text-gray-400 dark:text-gray-500 w-20 shrink-0">{row.time}</span>
                      <span className="min-w-0 flex-1 truncate">
                        <span className={row.tone === 'exam' ? 'font-semibold text-blue-600 dark:text-blue-300' : 'text-gray-700 dark:text-gray-200'}>
                          {row.label}
                        </span>
                        {row.detail && (
                          <span className="text-gray-500 dark:text-gray-400" title={row.fullUrl}> — {row.detail}</span>
                        )}
                      </span>
                      {row.postSubmission && (
                        <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                          after submit
                        </span>
                      )}
                      {row.tone !== 'exam' &&
                        (row.concerning ? (
                          <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                            ⚠ counts
                          </span>
                        ) : (
                          <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 dark:bg-gray-700/50 dark:text-gray-500">
                            info
                          </span>
                        ))}
                    </li>
                  ))}
                </ul>
                {s.endedAt && (
                  <div className="text-xs py-1 flex items-center gap-2">
                    <span className="font-mono font-semibold px-2 py-0.5 rounded w-32 shrink-0 text-center bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      LOGOFF
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">
                      {endedReasonLabel(s.endedReason)} at {time(s.endedAt)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {sessions.length === 0 ? 'No students have joined yet.' : 'No matches.'}
          </p>
        )}
      </div>
    </section>
  );
}
