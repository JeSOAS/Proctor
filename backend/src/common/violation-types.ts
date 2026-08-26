// Event types that count as a "warning" toward the violation limit (excludes
// benign WINDOW_FOCUS / TAB_CLOSED and the RECONNECT marker). Shared by the
// exams (count) and sessions (auto-close) services. The dashboard keeps its own
// copy in ui.tsx — keep them in sync.
export const CONCERNING_TYPES = [
  'WINDOW_BLUR',
  'TAB_SWITCH',
  'TAB_NAVIGATE',
  'TAB_CREATED',
  'COPY',
  'PASTE',
  'CUT',
  'LONG_DISCONNECT',
];
