import { useState } from 'react';

// Shared button styles — filled/tinted so actions clearly stand out.
export const btn = {
  primary: 'px-3 py-1.5 rounded-md text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700',
  neutral:
    'px-3 py-1.5 rounded-md text-sm font-semibold bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600',
  danger:
    'px-3 py-1.5 rounded-md text-sm font-semibold bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-200 dark:hover:bg-red-900/70',
  success: 'px-3 py-1.5 rounded-md text-sm font-semibold bg-green-600 text-white hover:bg-green-700',
};

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="text-xs font-semibold px-2.5 py-1 rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-200 dark:hover:bg-blue-900/70"
    >
      {copied ? '✓ Copied' : label}
    </button>
  );
}

/// Highlighted join code + copy button — the thing teachers share with students.
export function JoinCode({ code }: { code: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono font-bold tracking-widest text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded px-2 py-0.5">
        {code}
      </span>
      <CopyButton text={code} />
    </span>
  );
}

export function SearchBar({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || 'Search…'}
      className="w-full mb-4 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  );
}

/// A circled "?" that toggles a small popover with help text.
export function HelpIcon({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block align-middle">
      <button
        type="button"
        aria-label="Help"
        onClick={() => setOpen((o) => !o)}
        className="w-4 h-4 inline-flex items-center justify-center rounded-full border border-gray-400 dark:border-gray-500 text-[10px] leading-none text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        ?
      </button>
      {open && (
        <span className="absolute z-20 left-6 -top-1 w-64 p-2 text-xs rounded-md shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300">
          {text}
        </span>
      )}
    </span>
  );
}

/// Tiered warning: none (0) · orange (below max) · red (at max) · red + text (over).
/// `aiUsed` adds a loud "AI used" flag regardless of the count.
export function WarningBadge({ count, max, aiUsed }: { count: number; max: number; aiUsed?: boolean }) {
  if (count <= 0 && !aiUsed) return null;
  const atLimit = count >= max;
  const over = count > max;
  const cls = atLimit
    ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
  return (
    <span className="inline-flex items-center gap-2">
      {count > 0 && (
        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
          ⚠ {count}/{max}
        </span>
      )}
      {over && (
        <span className="text-xs font-semibold text-red-600 dark:text-red-400">
          Very high chance of cheating
        </span>
      )}
      {aiUsed && (
        <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-200">
          🤖 AI used
        </span>
      )}
    </span>
  );
}

/// Positive indicator: the platform (via the submission webhook) authoritatively
/// confirmed this student submitted — distinct from the extension's own detection.
export function SubmissionBadge({ confirmed }: { confirmed?: boolean }) {
  if (!confirmed) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
      ✔ Submission confirmed
    </span>
  );
}

/// Flag for a session that never visited the exam's required link (extension
/// off too soon, or the student never actually opened the exam).
export function NoExamBadge({ show }: { show?: boolean }) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
      ⚠ Did not open exam
    </span>
  );
}

/// Timing flags: opened the exam late, or submitted before the scheduled end.
export function TimingBadges({ late, early }: { late?: boolean; early?: boolean }) {
  if (!late && !early) return null;
  const pill = 'inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full';
  return (
    <>
      {late && <span className={`${pill} bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300`}>⏱ Started late</span>}
      {early && <span className={`${pill} bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300`}>✔ Finished early</span>}
    </>
  );
}

function fmtDur(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

/// Attention flags shown alongside the warnings. `tamper` counts (it's a real
/// violation); the rest are context: went idle, reconnected a lot, or had
/// monitoring gaps ("unaccounted" time while they kept coming back).
export function AttentionBadges({
  idle,
  reconnects,
  tamper,
  unaccountedSec,
}: {
  idle?: boolean;
  reconnects?: number;
  tamper?: boolean;
  unaccountedSec?: number;
}) {
  const pill = 'inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full';
  return (
    <>
      {tamper && (
        <span className={`${pill} bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200`}>
          🛠 Opened extension settings
        </span>
      )}
      {idle && <span className={`${pill} bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200`}>💤 Went idle</span>}
      {typeof reconnects === 'number' && reconnects > 2 && (
        <span className={`${pill} bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300`}>
          🔌 Reconnected {reconnects}×
        </span>
      )}
      {typeof unaccountedSec === 'number' && unaccountedSec >= 60 && (
        <span className={`${pill} bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300`}>
          🕳 {fmtDur(unaccountedSec)} unaccounted
        </span>
      )}
    </>
  );
}

// Plain-English labels for the raw event types — teachers shouldn't need to
// know what "WINDOW_BLUR" means.
const EVENT_LABELS: Record<string, string> = {
  TAB_NAVIGATE: 'Opened a page',
  TAB_SWITCH: 'Switched browser tab',
  TAB_CREATED: 'Opened a new tab',
  TAB_CLOSED: 'Closed a tab',
  NEW_WINDOW: 'Opened a new window',
  FULLSCREEN_EXIT: 'Left fullscreen',
  IDLE: 'Went idle (no activity)',
  WINDOW_BLUR: 'Left the Chrome window',
  WINDOW_FOCUS: 'Returned to Chrome',
  COPY: 'Copied text',
  CUT: 'Cut text',
  PASTE: 'Pasted from clipboard',
  LONG_DISCONNECT: 'Disconnected for a while',
  RECONNECT: 'Reconnected',
  REJOIN: 'Re-joined the exam',
  EXAM_STARTED: 'Opened the exam',
  EXAM_SUBMITTED: 'Submitted the exam',
  SUBMISSION_CONFIRMED: 'Submission confirmed (form)',
};
export function eventLabel(type: string): string {
  return EVENT_LABELS[type] || type;
}

// One-line explanation of each event, shown in the log's hover info popup.
const EVENT_HELP: Record<string, string> = {
  TAB_NAVIGATE: 'The student opened this page in the exam tab.',
  TAB_SWITCH: 'The student switched to another browser tab.',
  TAB_CREATED: 'The student opened a new browser tab.',
  TAB_CLOSED: 'The student closed a browser tab.',
  NEW_WINDOW: 'The student opened a separate browser window.',
  FULLSCREEN_EXIT: 'The student left the enforced fullscreen during the exam.',
  IDLE: 'No mouse/keyboard/scroll activity for a while — the student may be away or off-screen.',
  WINDOW_BLUR: 'The student left the Chrome window — e.g. switched to another app or screen.',
  COPY: 'The student copied text on this page.',
  CUT: 'The student cut text on this page.',
  PASTE: 'The student pasted text on this page.',
  LONG_DISCONNECT: "The student's connection dropped for a while.",
  RECONNECT: 'The student reconnected after a short drop.',
  REJOIN: 'The student left and re-joined the exam (same session continued).',
  EXAM_STARTED: 'The student opened the exam page.',
  EXAM_SUBMITTED: 'The student submitted the exam (detected by the extension).',
  SUBMISSION_CONFIRMED: 'The exam platform confirmed this submission (authoritative).',
};
export function eventHelp(type: string): string {
  return EVENT_HELP[type] || 'Recorded activity.';
}

/// A small "i" that reveals an information popup on hover — used to explain
/// non-counting ("info") log rows without cluttering the row with text.
export function InfoDot({ text }: { text: string }) {
  return (
    <span className="relative inline-flex group shrink-0">
      <span className="w-4 h-4 inline-flex items-center justify-center rounded-full border border-gray-400 dark:border-gray-500 text-[11px] leading-none font-semibold text-gray-500 dark:text-gray-400 cursor-help">
        i
      </span>
      <span className="pointer-events-none absolute z-20 right-0 top-6 w-56 p-2 text-xs rounded-md shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity">
        {text}
      </span>
    </span>
  );
}

/// Human-readable reason a session ended, for the log.
///   LEFT → the student pressed "Leave" (finished); EXAM_CLOSED → the teacher
///   closed the exam; TIMEOUT → heartbeats stopped (disconnected / closed
///   browser / extension off) and never resumed.
export function endedReasonLabel(reason?: string): string {
  switch (reason) {
    case 'LEFT':
      return 'Left the exam';
    case 'FINISHED_FULLSCREEN':
      return 'Finished (fullscreen)';
    case 'EXAM_CLOSED':
      return 'Exam ended';
    case 'AUTO_CLOSED':
      return 'Reached warning limit';
    case 'TIMEOUT':
      return 'Disconnected (unexpected)';
    default:
      return 'Ended';
  }
}

const PILL: Record<string, string> = {
  green: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  gray: 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};
const DOT: Record<string, string> = {
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  gray: 'bg-gray-400',
};

/// Live connection status. Hidden once the exam closes.
///  Online (green) / Not responding (amber) / Disconnected (red) / Left (gray).
export function StatusPill({ session, examClosed }: { session: any; examClosed: boolean }) {
  if (examClosed) return null;
  let label = 'Online';
  let color = 'green';
  if (session.status === 'ENDED') {
    if (session.endedReason === 'LEFT') {
      label = 'Left';
      color = 'gray';
    } else {
      label = 'Disconnected';
      color = 'red';
    }
  } else if (session.status === 'DISCONNECTED') {
    label = 'Disconnected';
    color = 'red';
  } else {
    const age = Date.now() - new Date(session.lastSeenAt).getTime();
    if (age >= 90_000) {
      label = 'Disconnected';
      color = 'red';
    } else if (age >= 45_000) {
      label = 'Not responding';
      color = 'amber';
    }
  }
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${PILL[color]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${DOT[color]}`} />
      {label}
    </span>
  );
}
