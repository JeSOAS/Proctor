import { useState } from 'react';
import { applyTheme, getTheme, Theme } from '../theme';
import { CoursesPanel } from '../components/CoursesPanel';
import { ExamsPanel } from '../components/ExamsPanel';
import { SessionsPanel } from '../components/SessionsPanel';

export function Dashboard({ teacher, onLogout }: { teacher: any; onLogout: () => void }) {
  const [course, setCourse] = useState<any>(null);
  const [exam, setExam] = useState<any>(null);
  const [theme, setThemeState] = useState<Theme>(getTheme());

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setThemeState(next);
  }

  // Emphasise where the teacher is.
  let title = 'Courses';
  let subtitle = 'Your courses';
  if (course && !exam) {
    title = course.name;
    subtitle = [course.year, course.section].filter(Boolean).join(' · ') || 'Course';
  }
  if (exam) {
    title = exam.title;
    subtitle = course ? course.name : 'Exam';
  }

  const crumb = 'hover:text-blue-600 dark:hover:text-blue-400';
  const active = 'text-gray-900 dark:text-gray-100 font-medium';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
            Proctor
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
            <button
              onClick={toggleTheme}
              title="Toggle light / dark"
              className="w-8 h-8 rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <span className="hidden sm:inline">{teacher.name}</span>
            <button
              onClick={onLogout}
              className="px-3 py-1 rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <nav className="text-sm mb-2 flex items-center gap-1 text-gray-400 dark:text-gray-500">
          <button className={`${crumb} ${!course ? active : ''}`} onClick={() => { setCourse(null); setExam(null); }}>
            Courses
          </button>
          {course && (
            <>
              <span>/</span>
              <button className={`${crumb} ${course && !exam ? active : ''}`} onClick={() => setExam(null)}>
                {course.name}
              </button>
            </>
          )}
          {exam && (
            <>
              <span>/</span>
              <span className={active}>{exam.title}</span>
            </>
          )}
        </nav>

        <div className="mb-5">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{title}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
        </div>

        {!course && <CoursesPanel onOpen={setCourse} />}
        {course && !exam && <ExamsPanel course={course} onOpen={setExam} />}
        {exam && <SessionsPanel exam={exam} />}
      </main>
    </div>
  );
}
