import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api';

export function CoursesPanel({ onOpen }: { onOpen: (course: any) => void }) {
  const [courses, setCourses] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
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
    try {
      await api.createCourse(name, subject);
      setName('');
      setSubject('');
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

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Your courses</h2>

      <form onSubmit={create} className="flex flex-wrap gap-2 mb-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Course name"
          className="flex-1 min-w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject (optional)"
          className="flex-1 min-w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <button className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
          Add course
        </button>
      </form>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="grid gap-2">
        {courses.map((c) => (
          <div
            key={c.id}
            className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between"
          >
            <button className="text-left" onClick={() => onOpen(c)}>
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-gray-500">
                {c.subject || 'No subject'} · {c._count?.exams ?? 0} exam(s)
              </div>
            </button>
            <button
              onClick={() => remove(c.id)}
              className="text-xs text-red-600 hover:underline"
            >
              Delete
            </button>
          </div>
        ))}
        {courses.length === 0 && (
          <p className="text-sm text-gray-500">No courses yet — add one above.</p>
        )}
      </div>
    </section>
  );
}
