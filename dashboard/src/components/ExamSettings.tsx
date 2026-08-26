import { useState } from 'react';
import { api } from '../api';
import { HelpIcon, btn } from '../ui';

const numInput =
  'w-20 px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100';

/// Per-exam advanced settings, reusable on the exam list and the exam page.
/// Max warnings + disconnect grace are functional; the two toggles are stubs.
export function ExamSettings({
  exam,
  onSaved,
}: {
  exam: any;
  onSaved?: (updated: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const [max, setMax] = useState<number>(exam.maxWarnings ?? 3);
  const [graceSec, setGraceSec] = useState<number>(exam.disconnectGraceSec ?? 180);
  const [notify, setNotify] = useState<boolean>(!!exam.notifyStudent);
  const [autoClose, setAutoClose] = useState<boolean>(!!exam.autoClose);
  const [savedMsg, setSavedMsg] = useState('');
  const [error, setError] = useState('');

  async function save() {
    setError('');
    setSavedMsg('');
    try {
      const updated = await api.updateExam(exam.id, {
        maxWarnings: max,
        disconnectGraceSec: graceSec,
        notifyStudent: notify,
        autoClose,
      });
      setSavedMsg('Saved');
      setTimeout(() => setSavedMsg(''), 1500);
      onSaved?.(updated);
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-semibold text-gray-800 dark:text-gray-100"
      >
        <span aria-hidden>⚙️</span>
        <span>Advanced settings</span>
        <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-100">
          {open ? 'Hide ▲' : 'Show ▼'}
        </span>
      </button>

      {open && (
        <div className="px-4 py-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 space-y-3 text-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="inline-flex items-center gap-2">
              <span className="text-gray-600 dark:text-gray-300">Max warnings</span>
              <input type="number" min={1} value={max} onChange={(e) => setMax(Number(e.target.value))} className={numInput} />
            </label>
            <label className="inline-flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-300">
                Disconnect grace (sec)
                <HelpIcon text="A disconnect shorter than this is recorded but NOT counted as a warning; longer gaps count." />
              </span>
              <input type="number" min={0} value={graceSec} onChange={(e) => setGraceSec(Number(e.target.value))} className={numInput} />
            </label>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="w-4 h-4 accent-blue-600" />
              <span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-300">
                Notify students of violations
                <HelpIcon text="When on, students are warned on their own screen and shown remaining warnings. Not active yet — needs an extension update." />
              </span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={autoClose} onChange={(e) => setAutoClose(e.target.checked)} className="w-4 h-4 accent-blue-600" />
              <span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-300">
                Auto-close on limit
                <HelpIcon text="When on, a student's proctoring auto-closes once they hit the max warnings (recorded in the log). Not active yet." />
              </span>
            </label>
          </div>

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex items-center gap-3">
            <button onClick={save} className={btn.primary}>
              Save settings
            </button>
            {savedMsg && <span className="text-xs text-green-600 dark:text-green-400">{savedMsg}</span>}
            <span className="text-xs text-gray-400 dark:text-gray-500">
              The two toggles are stubs — behaviour comes later.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
