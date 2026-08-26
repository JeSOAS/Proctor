import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api';
import { SearchBar } from '../ui';

const input =
  'px-3 py-2 rounded-lg text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500';

export function CoursesPanel({ onOpen }: { onOpen: (course: any) => void }) {
  const [courses, setCourses] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [year, setYear] = useState('');
  const [section, setSection] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      setCourses(await api.listCourses());
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Course name is required.');
    try {
      await api.createCourse(name, year, section);
      setName('');
      setYear('');
      setSection('');
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this course and all its exams?')) return;
    try {
      await api.deleteCourse(id);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  const filtered = courses.filter((c) =>
    [c.name, c.year, c.section].filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <section>
      <form onSubmit={create} className="flex flex-wrap gap-2 mb-4">
        <input value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year" className={`w-28 ${input}`} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Course name" className={`flex-1 min-w-40 ${input}`} />
        <input value={section} onChange={(e) => setSection(e.target.value)} placeholder="Section" className={`w-28 ${input}`} />
        <button className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
          Add course
        </button>
      </form>

      {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}

      <SearchBar value={q} onChange={setQ} placeholder="Search courses…" />

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Year</th>
              <th className="px-4 py-2 font-medium">Course name</th>
              <th className="px-4 py-2 font-medium">Section</th>
              <th className="px-4 py-2 font-medium">Exams</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800/40">
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.year || '—'}</td>
                <td className="px-4 py-3">
                  <button
                    className="font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400"
                    onClick={() => onOpen(c)}
                  >
                    {c.name}
                  </button>
                </td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.section || '—'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c._count?.exams ?? 0}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button
                    onClick={() => onOpen(c)}
                    className="text-xs font-medium px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 mr-2"
                  >
                    Open →
                  </button>
                  <button
                    onClick={() => remove(c.id)}
                    className="text-xs font-medium px-3 py-1.5 rounded-md border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400 dark:text-gray-500">
                  {courses.length === 0 ? 'No courses yet — add one above.' : 'No matches.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
