import { useEffect, useRef, useState } from 'react';
import { applyTheme, getTheme, Theme } from '../theme';
import { btn } from '../ui';
import { CoursesPanel } from '../components/CoursesPanel';
import { ExamsPanel } from '../components/ExamsPanel';
import { SessionsPanel } from '../components/SessionsPanel';

export function Dashboard({ teacher, onLogout }: { teacher: any; onLogout: () => void }) {
  // Restore where we were if the page was refreshed mid-drill-down.
  const initialNav = history.state?.proctorNav ?? { course: null, exam: null };
  const [course, setCourse] = useState<any>(initialNav.course ?? null);
  const [exam, setExam] = useState<any>(initialNav.exam ?? null);
  const [theme, setThemeState] = useState<Theme>(getTheme());

  // Browser-style history for the drill-down. Drilling in pushes an entry;
  // Back/Forward (the ←/→ buttons, Alt+←/→, and the mouse back/forward buttons)
  // traverse them via popstate. `pos` is our index in the stack; `maxPos` is the
  // furthest we've reached, so we can tell when Forward is available.
  const [pos, setPos] = useState<number>(history.state?.pos ?? 0);
  const maxPos = useRef<number>(pos);

  useEffect(() => {
    // Seed the current entry so there's something to return to / restore.
    if (!history.state?.proctorNav) {
      history.replaceState({ ...history.state, proctorNav: { course, exam }, pos }, '');
    }
    const onPop = (e: PopStateEvent) => {
      const nav = e.state?.proctorNav ?? { course: null, exam: null };
      setCourse(nav.course ?? null);
      setExam(nav.exam ?? null);
      setPos(e.state?.pos ?? 0);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigate to a view AND record it in history (this truncates any forward entries).
  function go(nextCourse: any, nextExam: any) {
    setCourse(nextCourse);
    setExam(nextExam);
    const nextPos = pos + 1;
    setPos(nextPos);
    maxPos.current = nextPos;
    history.pushState(
      { ...history.state, proctorNav: { course: nextCourse, exam: nextExam }, pos: nextPos },
      '',
    );
  }

  const canBack = pos > 0;
  const canForward = pos < maxPos.current;

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
  const navBtn = (enabled: boolean) =>
    `w-9 h-9 rounded-md border text-lg leading-none border-gray-300 dark:border-gray-600 ${
      enabled
        ? 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'
        : 'opacity-40 cursor-not-allowed text-gray-400 dark:text-gray-600'
    }`;

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
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => history.back()} disabled={!canBack} className={navBtn(canBack)} title="Back (Alt+←)">
            ←
          </button>
          <button onClick={() => history.forward()} disabled={!canForward} className={navBtn(canForward)} title="Forward (Alt+→)">
            →
          </button>
        </div>

        <nav className="text-sm mb-2 flex items-center gap-1 text-gray-400 dark:text-gray-500">
          <button className={`${crumb} ${!course ? active : ''}`} onClick={() => go(null, null)}>
            Courses
          </button>
          {course && (
            <>
              <span>/</span>
              <button className={`${crumb} ${course && !exam ? active : ''}`} onClick={() => go(course, null)}>
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

        {!course && <CoursesPanel onOpen={(c) => go(c, null)} />}
        {course && !exam && <ExamsPanel course={course} onOpen={(e) => go(course, e)} />}
        {exam && <SessionsPanel exam={exam} />}
      </main>
    </div>
  );
}
