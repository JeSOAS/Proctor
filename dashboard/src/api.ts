// In production the dashboard is served by the backend on the same origin, so
// the API base is empty (relative paths). In dev (Vite on :5173) we call the
// backend directly on :3000 — its CORS is open, so no proxy is needed.
const API_BASE = import.meta.env.DEV ? 'http://localhost:3000' : '';

let token: string | null = localStorage.getItem('proctor_token');

export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem('proctor_token', t);
  else localStorage.removeItem('proctor_token');
}

async function req(path: string, options: RequestInit = {}): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, { ...options, headers });
  if (res.status === 401) {
    setToken(null);
    throw new Error('Session expired — please log in again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export const api = {
  login: (email: string, password: string) =>
    req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => req('/auth/me'),

  listCourses: () => req('/courses'),
  createCourse: (name: string, year: string, section: string) =>
    req('/courses', { method: 'POST', body: JSON.stringify({ name, year, section }) }),
  deleteCourse: (id: string) => req(`/courses/${id}`, { method: 'DELETE' }),

  listExams: () => req('/exams'),
  createExam: (input: {
    courseId: string;
    title: string;
    maxWarnings: number;
    startsAt?: string;
    endsAt?: string;
    expectedStudents?: number;
    examLink?: string;
  }) => req('/exams', { method: 'POST', body: JSON.stringify(input) }),
  setExamStatus: (id: string, status: string) =>
    req(`/exams/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  updateExam: (id: string, patch: Record<string, unknown>) =>
    req(`/exams/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteExam: (id: string) => req(`/exams/${id}`, { method: 'DELETE' }),
  examSessions: (id: string) => req(`/exams/${id}/sessions`),

  sessionViolations: (id: string) => req(`/sessions/${id}/violations`),
  deleteSession: (id: string) => req(`/sessions/${id}`, { method: 'DELETE' }),
};
