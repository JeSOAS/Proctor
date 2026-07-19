import { useState } from 'react';
import { CoursesPanel } from '../components/CoursesPanel';
import { ExamsPanel } from '../components/ExamsPanel';
import { SessionsPanel } from '../components/SessionsPanel';

export function Dashboard({
  teacher,
  onLogout,
}: {
  teacher: any;
  onLogout: () => void;
}) {
  const [course, setCourse] = useState<any>(null);
  const [exam, setExam] = useState<any>(null);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
            Proctor
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span>{teacher.name}</span>
            <button
              onClick={onLogout}
              className="px-3 py-1 rounded-md border border-gray-300 hover:bg-gray-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Breadcrumbs */}
        <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1">
          <button
            className="hover:text-gray-900"
            onClick={() => {
              setCourse(null);
              setExam(null);
            }}
          >
            Courses
          </button>
          {course && (
            <>
              <span>/</span>
              <button className="hover:text-gray-900" onClick={() => setExam(null)}>
                {course.name}
              </button>
            </>
          )}
          {exam && (
            <>
              <span>/</span>
              <span className="text-gray-900">{exam.title}</span>
            </>
          )}
        </nav>

        {!course && <CoursesPanel onOpen={setCourse} />}
        {course && !exam && (
          <ExamsPanel course={course} onOpen={setExam} onBack={() => setCourse(null)} />
        )}
        {exam && <SessionsPanel exam={exam} onBack={() => setExam(null)} />}
      </main>
    </div>
  );
}
