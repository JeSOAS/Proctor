import { useEffect, useState } from 'react';
import { api, setToken } from './api';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';

export function App() {
  const [teacher, setTeacher] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem('proctor_token')) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(setTeacher)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8 text-gray-500">Loading…</div>;
  }
  if (!teacher) {
    return <Login onLogin={setTeacher} />;
  }
  return (
    <Dashboard
      teacher={teacher}
      onLogout={() => {
        setToken(null);
        setTeacher(null);
      }}
    />
  );
}
