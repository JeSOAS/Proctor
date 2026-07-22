export type Theme = 'dark' | 'light';

// Default is dark; the teacher's choice is remembered in localStorage.
export function getTheme(): Theme {
  return localStorage.getItem('proctor_theme') === 'light' ? 'light' : 'dark';
}

export function applyTheme(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark');
  localStorage.setItem('proctor_theme', t);
}
