import { useState } from 'react';

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
      className="text-xs px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
    >
      {copied ? 'Copied!' : label}
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

// Events that suggest the student left the exam or used the clipboard are
// highlighted; benign ones (returning focus, closing a tab) stay muted.
const CONCERNING = new Set([
  'WINDOW_BLUR',
  'TAB_SWITCH',
  'TAB_NAVIGATE',
  'TAB_CREATED',
  'COPY',
  'PASTE',
  'CUT',
]);

export function isConcerning(type: string) {
  return CONCERNING.has(type);
}

export function violationClasses(type: string) {
  return isConcerning(type)
    ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
}

/// Violation-count badge — red when there's anything to look at.
export function CountBadge({ count }: { count: number }) {
  const cls =
    count > 0
      ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
      : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400';
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {count} event{count === 1 ? '' : 's'}
    </span>
  );
}
