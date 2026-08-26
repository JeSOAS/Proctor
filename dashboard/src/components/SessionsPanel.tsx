import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { HelpIcon, JoinCode, SearchBar, StatusPill, WarningBadge, btn, violationClasses } from '../ui';
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

export function SessionsPanel({ exam }: { exam: any }) {
  const [status, setStatus] = useState<string>(exam.status);
  const [sessions, setSessions] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [violations, setViolations] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  // Kept in sync with the settings panel so the warning badges use the live max.
  const [max, setMax] = useState<number>(exam.maxWarnings ?? 3);

  const load = useCallback(async () => {
    try {
      setSessions(await api.examSessions(exam.id));
    } catch (e: any) {
      setError(e.message);
    }
  }, [exam.id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
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
        <div>Max warnings: <span className="text-gray-700 dark:text-gray-300">{max}</span></div>
        <div>Planned: <span className="text-gray-700 dark:text-gray-300">{range(exam.startsAt, exam.endsAt)}</span></div>
        <div>Actual: <span className="text-gray-700 dark:text-gray-300">{range(exam.openedAt, exam.closedAt)}</span></div>
        <div>Created: <span className="text-gray-700 dark:text-gray-300">{fmt(exam.createdAt) || '—'}</span></div>
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
          <div key={s.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <button className="text-left min-w-0" onClick={() => toggleViolations(s.id)}>
                <div className="font-medium flex flex-wrap items-center gap-2">
                  <StatusPill session={s} examClosed={examClosed} />
                  <span className="text-gray-900 dark:text-gray-100">{s.studentName}</span>
                  <WarningBadge count={s.concerningCount ?? 0} max={max} />
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {s.studentId || 'no ID'} · joined {time(s.startedAt)}
                  {s.endedAt && (
                    <> · {s.endedReason === 'LEFT' ? 'left' : s.endedReason === 'TIMEOUT' ? 'timed out' : 'ended'} {time(s.endedAt)}</>
                  )}
                  {' '}· seen {time(s.lastSeenAt)} · {s._count?.violations ?? 0} event(s)
                </div>
              </button>
              <button onClick={() => removeSession(s.id)} className={`${btn.danger} shrink-0`}>
                Delete
              </button>
            </div>

            {expanded === s.id && (
              <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-2 bg-gray-50 dark:bg-gray-900/40">
                {violations.length === 0 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 py-1">No events recorded.</p>
                )}
                <ul className="text-xs divide-y divide-gray-100 dark:divide-gray-700">
                  {violations.map((v) => (
                    <li key={v.id} className="py-1.5 flex items-center gap-2">
                      <span className={`font-mono font-semibold px-2 py-0.5 rounded w-32 shrink-0 text-center ${violationClasses(v.type)}`}>
                        {v.type}
                      </span>
                      <span className="text-gray-400 dark:text-gray-500 w-20 shrink-0">
                        {new Date(v.occurredAt).toLocaleTimeString()}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400 truncate">
                        {v.type === 'RECONNECT' || v.type === 'LONG_DISCONNECT'
                          ? `offline ${fmtGap(v.payload?.seconds)}`
                          : v.url || ''}
                      </span>
                    </li>
                  ))}
                </ul>
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
