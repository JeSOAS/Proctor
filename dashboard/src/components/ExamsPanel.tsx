import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api';
import { HelpIcon, JoinCode, SearchBar, btn } from '../ui';
import { ExamSettings } from './ExamSettings';

const STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  SCHEDULED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  CLOSED: 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  DRAFT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
};

// An OPEN exam whose start time is still in the future shows as SCHEDULED —
// students can't join until it starts.
function effectiveStatus(e: any): string {
  if (e.status === 'OPEN' && e.startsAt && new Date(e.startsAt) > new Date()) {
    return 'SCHEDULED';
  }
  return e.status;
}

const input =
  'px-3 py-2 rounded-lg text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500';

const fmt = (d?: string) => (d ? new Date(d).toLocaleString() : null);

export function ExamsPanel({ course, onOpen }: { course: any; onOpen: (exam: any) => void }) {
  const [exams, setExams] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [maxWarnings, setMaxWarnings] = useState(3);
  const [expectedStudents, setExpectedStudents] = useState('');
  const [examLink, setExamLink] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const all = await api.listExams();
      setExams(all.filter((e: any) => e.courseId === course.id));
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, [course.id]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!title.trim()) return setError('Exam title is required.');
    try {
      await api.createExam({
        courseId: course.id,
        title,
        maxWarnings: Number(maxWarnings),
        expectedStudents: expectedStudents ? Number(expectedStudents) : undefined,
        examLink: examLink.trim() || undefined,
        startsAt: startsAt || undefined,
        endsAt: endsAt || undefined,
      });
      setTitle('');
      setExpectedStudents('');
      setExamLink('');
      setStartsAt('');
      setEndsAt('');
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this exam and its student sessions?')) return;
    try {
      await api.deleteExam(id);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function changeStatus(id: string, status: string) {
    try {
      await api.setExamStatus(id, status);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  const filtered = exams.filter((e) =>
    `${e.title} ${e.joinCode}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <section>
      <form onSubmit={create} className="mb-4 space-y-2">
        <div className="flex flex-wrap gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Exam title" className={`flex-1 min-w-48 ${input}`} />
          <label className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
            Max warnings
            <input type="number" min={0} value={maxWarnings} onChange={(e) => setMaxWarnings(Number(e.target.value))} className={`w-16 ${input}`} />
          </label>
          <label className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1">
              Expected students
              <HelpIcon text="How many students should sit this exam. The dashboard shows joined / expected so you can see who's missing." />
            </span>
            <input type="number" min={0} value={expectedStudents} onChange={(e) => setExpectedStudents(e.target.value)} placeholder="—" className={`w-16 ${input}`} />
          </label>
        </div>
        <label className="block text-xs text-gray-500 dark:text-gray-400">
          <span className="inline-flex items-center gap-1">
            Exam link (required page)
            <HelpIcon text="The URL students must open for this exam (e.g. the Google Form). It's auto-whitelisted, and any student whose session never visits this domain is flagged 'Did not open exam'." />
          </span>
          <input value={examLink} onChange={(e) => setExamLink(e.target.value)} placeholder="https://docs.google.com/forms/d/…" className={`block w-full mt-1 ${input}`} />
        </label>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs text-gray-500 dark:text-gray-400">
            Start time (optional)
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={`block mt-1 ${input}`} />
          </label>
          <label className="text-xs text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1">
              End time / auto-close (optional)
              <HelpIcon text="Leave empty to end the exam yourself. If set, the exam closes automatically at that time. Any exam left open with no end time auto-closes after 24 hours." />
            </span>
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={`block mt-1 ${input}`} />
          </label>
          <button className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
            Create exam
          </button>
        </div>
      </form>

      {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}

      <SearchBar value={q} onChange={setQ} placeholder="Search exams…" />

      <div className="grid gap-2">
        {filtered.map((e) => (
          <div key={e.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium flex items-center gap-2 mb-1">
                  <button className="text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400" onClick={() => onOpen(e)}>
                    {e.title}
                  </button>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[effectiveStatus(e)] || ''}`}>{effectiveStatus(e)}</span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Join code</span>
                  <JoinCode code={e.joinCode} />
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {(e._count?.sessions ?? 0)}
                  {typeof e.expectedStudents === 'number' ? ` / ${e.expectedStudents} expected` : ' student(s)'}
                  {fmt(e.startsAt) && <> · starts {fmt(e.startsAt)}</>}
                  {fmt(e.endsAt) && <> · ends {fmt(e.endsAt)}</>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <button onClick={() => onOpen(e)} className={`${btn.primary} w-24 text-center`}>
                  Monitor →
                </button>
                {e.status === 'CLOSED' ? (
                  <button onClick={() => changeStatus(e.id, 'OPEN')} className={`${btn.success} w-24 text-center`}>
                    Reopen
                  </button>
                ) : (
                  <button onClick={() => changeStatus(e.id, 'CLOSED')} className={`${btn.neutral} w-24 text-center`}>
                    Close
                  </button>
                )}
                <button onClick={() => remove(e.id)} className={`${btn.danger} w-24 text-center`}>
                  Delete
                </button>
              </div>
            </div>
            <div className="mt-3">
              <ExamSettings exam={e} onSaved={() => load()} />
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {exams.length === 0 ? 'No exams yet — create one above.' : 'No matches.'}
          </p>
        )}
      </div>
    </section>
  );
}
