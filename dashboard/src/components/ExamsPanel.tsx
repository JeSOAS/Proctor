import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api';

const STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-green-100 text-green-700',
  CLOSED: 'bg-gray-200 text-gray-600',
  DRAFT: 'bg-yellow-100 text-yellow-700',
};

export function ExamsPanel({
  course,
  onOpen,
  onBack,
}: {
  course: any;
  onOpen: (exam: any) => void;
  onBack: () => void;
}) {
  const [exams, setExams] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [maxWarnings, setMaxWarnings] = useState(3);
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
    try {
      await api.createExam(course.id, title, Number(maxWarnings));
      setTitle('');
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

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Exams in {course.name}</h2>
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-900">
          ← Courses
        </button>
      </div>

      <form onSubmit={create} className="flex flex-wrap gap-2 mb-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Exam title"
          className="flex-1 min-w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <label className="flex items-center gap-1 text-sm text-gray-500">
          Max warnings
          <input
            type="number"
            min={0}
            value={maxWarnings}
            onChange={(e) => setMaxWarnings(Number(e.target.value))}
            className="w-16 px-2 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </label>
        <button className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
          Create exam
        </button>
      </form>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="grid gap-2">
        {exams.map((e) => (
          <div
            key={e.id}
            className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between"
          >
            <button className="text-left" onClick={() => onOpen(e)}>
              <div className="font-medium flex items-center gap-2">
                {e.title}
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[e.status] || ''}`}
                >
                  {e.status}
                </span>
              </div>
              <div className="text-xs text-gray-500">
                Join code <span className="font-mono font-semibold">{e.joinCode}</span> ·{' '}
                {e._count?.sessions ?? 0} student(s)
              </div>
            </button>
            <button
              onClick={() => remove(e.id)}
              className="text-xs text-red-600 hover:underline"
            >
              Delete
            </button>
          </div>
        ))}
        {exams.length === 0 && (
          <p className="text-sm text-gray-500">No exams yet — create one above.</p>
        )}
      </div>
    </section>
  );
}
