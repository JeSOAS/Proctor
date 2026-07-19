import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

const SESSION_STYLES: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  ENDED: 'bg-gray-200 text-gray-600',
  DISCONNECTED: 'bg-red-100 text-red-700',
};

export function SessionsPanel({ exam, onBack }: { exam: any; onBack: () => void }) {
  const [status, setStatus] = useState<string>(exam.status);
  const [sessions, setSessions] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [violations, setViolations] = useState<any[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setSessions(await api.examSessions(exam.id));
    } catch (e: any) {
      setError(e.message);
    }
  }, [exam.id]);

  // Live view: refresh the session list every 5s.
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
    if (expanded === id) {
      setExpanded(null);
      return;
    }
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

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold">{exam.title}</h2>
          <p className="text-xs text-gray-500">
            Join code <span className="font-mono font-semibold">{exam.joinCode}</span> · status {status}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status !== 'OPEN' && (
            <button
              onClick={() => changeStatus('OPEN')}
              className="text-sm px-3 py-1 rounded-md bg-green-600 text-white hover:bg-green-700"
            >
              Open
            </button>
          )}
          {status !== 'CLOSED' && (
            <button
              onClick={() => changeStatus('CLOSED')}
              className="text-sm px-3 py-1 rounded-md bg-gray-700 text-white hover:bg-gray-800"
            >
              Close
            </button>
          )}
          <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-900">
            ← Exams
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <p className="text-xs text-gray-400 mb-2">Live — refreshes every 5s.</p>

      <div className="grid gap-2">
        {sessions.map((s) => (
          <div key={s.id} className="bg-white border border-gray-200 rounded-lg">
            <div className="px-4 py-3 flex items-center justify-between">
              <button className="text-left" onClick={() => toggleViolations(s.id)}>
                <div className="font-medium flex items-center gap-2">
                  {s.studentName}
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${SESSION_STYLES[s.status] || ''}`}
                  >
                    {s.status}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  {s.studentId || 'no ID'} · {s._count?.violations ?? 0} event(s) ·{' '}
                  seen {new Date(s.lastSeenAt).toLocaleTimeString()}
                </div>
              </button>
              <button
                onClick={() => removeSession(s.id)}
                className="text-xs text-red-600 hover:underline"
              >
                Delete
              </button>
            </div>

            {expanded === s.id && (
              <div className="border-t border-gray-100 px-4 py-2 bg-gray-50">
                {violations.length === 0 && (
                  <p className="text-xs text-gray-400 py-1">No events recorded.</p>
                )}
                <ul className="text-xs divide-y divide-gray-100">
                  {violations.map((v) => (
                    <li key={v.id} className="py-1 flex items-center gap-2">
                      <span className="font-mono font-semibold text-gray-700 w-32 shrink-0">
                        {v.type}
                      </span>
                      <span className="text-gray-400 w-20 shrink-0">
                        {new Date(v.occurredAt).toLocaleTimeString()}
                      </span>
                      <span className="text-gray-500 truncate">{v.url || ''}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
        {sessions.length === 0 && (
          <p className="text-sm text-gray-500">No students have joined yet.</p>
        )}
      </div>
    </section>
  );
}
