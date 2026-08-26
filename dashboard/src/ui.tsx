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

// Events that suggest the student left the exam or used the clipboard (kept in
// sync with the backend's CONCERNING_TYPES).
const CONCERNING = new Set([
  'WINDOW_BLUR',
  'TAB_SWITCH',
  'TAB_NAVIGATE',
  'TAB_CREATED',
  'COPY',
  'PASTE',
  'CUT',
  'LONG_DISCONNECT',
]);

export function isConcerning(type: string) {
  return CONCERNING.has(type);
}

export function violationClasses(type: string) {
  return isConcerning(type)
    ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
}

/// Tiered warning: none (0) · orange (below max) · red (at max) · red + text (over).
export function WarningBadge({ count, max }: { count: number; max: number }) {
  if (count <= 0) return null;
  const atLimit = count >= max;
  const over = count > max;
  const cls = atLimit
    ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
        ⚠ {count}/{max}
      </span>
      {over && (
        <span className="text-xs font-semibold text-red-600 dark:text-red-400">
          Very high chance of cheating
        </span>
      )}
    </span>
  );
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
