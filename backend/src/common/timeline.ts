import { ClassifiableEvent, ClassifyResult, examLinkRule, isSubmissionPage } from './concerning';
import { ruleMatches } from './allowed-domains';

// Builds the readable event timeline shown on the dashboard (per student) and in
// the full-log CSV, so both always show the same rows. Display only: what counts
// is decided by classify(); this only decides how the events are presented.
//
//   - A window blur becomes one "away" row (with its length) at the moment the
//     student left; the event that ended the absence is not shown separately.
//   - One action that Chrome reports as several events (a new tab = created +
//     switched; a new window = window + tab + switch) is shown as one row.
//   - A page that only changed its query string, and the page Google Forms
//     shows right after submitting, are not repeated.
//   - URLs are shortened to site + path; for search engines the search words
//     are kept, because they are what the instructor needs to see.

export interface TimelineEntry {
  id: number;
  at: Date;
  /** Event type, or a display kind: AWAY, LEFT_CHROME, EXTENSION_SETTINGS, INCOGNITO_WINDOW. */
  kind: string;
  /** Short, readable detail (shortened URL, gap length, typed name …). */
  detail: string;
  /** Full URL of the event, if any. */
  url: string | null;
  /** Length of an AWAY row, in seconds. */
  seconds?: number;
  concerning: boolean;
  postSubmission: boolean;
}

const MERGE_WINDOW_MS = 2_000;
const TAB_KINDS = ['TAB_SWITCH', 'TAB_CREATED', 'NEW_WINDOW', 'INCOGNITO_WINDOW']; // low → high priority
const PAGE_KINDS = new Set(['TAB_NAVIGATE', 'TAB_SWITCH', 'TAB_CREATED', 'NEW_WINDOW', 'INCOGNITO_WINDOW', 'EXAM_SUBMITTED']);

const SEARCH_PARAMS: { host: RegExp; path: RegExp; param: string }[] = [
  { host: /(^|\.)google\.[a-z.]+$/, path: /^\/search/, param: 'q' },
  { host: /(^|\.)bing\.com$/, path: /^\/search/, param: 'q' },
  { host: /(^|\.)duckduckgo\.com$/, path: /^\//, param: 'q' },
  { host: /(^|\.)search\.yahoo\.com$/, path: /^\/search/, param: 'p' },
  { host: /(^|\.)search\.brave\.com$/, path: /^\/search/, param: 'q' },
];

/** "docs.google.com/forms/d/…/viewform" or "www.google.com/search · searched “news”". */
export function shortUrl(url: string | null | undefined): string {
  if (!url) return '';
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url.length > 120 ? url.slice(0, 119) + '…' : url;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return url; // chrome://newtab/ etc.
  const path = u.pathname === '/' ? '' : u.pathname;
  let out = u.host + path;
  if (out.length > 100) out = out.slice(0, 99) + '…';
  const engine = SEARCH_PARAMS.find((s) => s.host.test(u.host) && s.path.test(u.pathname));
  const words = engine && u.searchParams.get(engine.param);
  return words ? `${out} · searched "${words}"` : out;
}

const hostPath = (url: string | null): string | null => {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.host + u.pathname;
  } catch {
    return url;
  }
};

export function buildTimeline(
  events: ClassifiableEvent[],
  r: ClassifyResult,
  opts: { examLink?: string | null } = {},
): TimelineEntry[] {
  const examRule = examLinkRule(opts.examLink);
  const onExamPage = (url: string | null) => {
    if (!examRule || !url) return false;
    try {
      const u = new URL(url);
      return ruleMatches(examRule, u.host, u.pathname || '/');
    } catch {
      return false;
    }
  };
  const submissionPage = (url: string) => {
    try {
      const u = new URL(url);
      return isSubmissionPage(u.host, u.pathname);
    } catch {
      return false;
    }
  };
  const payloadOf = (p: unknown): any => {
    if (p == null) return null;
    try {
      return typeof p === 'string' ? JSON.parse(p) : p;
    } catch {
      return null;
    }
  };

  const out: TimelineEntry[] = [];
  let lastPage: string | null = null; // host + path of the last page row shown
  const entry = (ev: ClassifiableEvent, kind: string, detail: string): TimelineEntry => ({
    id: ev.id,
    at: ev.occurredAt,
    kind,
    detail,
    url: ev.url,
    concerning: r.concerning.has(ev.id),
    postSubmission: r.postSubmission.has(ev.id),
  });

  for (const ev of events) {
    const payload = payloadOf(ev.payload);
    switch (ev.type) {
      case 'WINDOW_BLUR': {
        const secs = r.awaySeconds.get(ev.id);
        const e = entry(ev, secs === undefined ? 'LEFT_CHROME' : 'AWAY', shortUrl(ev.url));
        if (secs !== undefined) e.seconds = secs;
        out.push(e);
        continue;
      }
      case 'WINDOW_FOCUS':
        continue; // shown as the end of the AWAY row
      case 'ID_CONFLICT':
        out.push(entry(ev, ev.type, `name entered: "${payload?.attemptedName ?? '?'}"`));
        continue;
      case 'NAME_MISMATCH':
        out.push(entry(ev, ev.type, `name entered: "${payload?.typedName ?? '?'}"`));
        continue;
      case 'LONG_DISCONNECT':
      case 'RECONNECT':
        out.push(entry(ev, ev.type, payload?.seconds != null ? `offline ${fmtGap(payload.seconds)}` : ''));
        continue;
      case 'FULLSCREEN_EXIT':
        // The URL is the tab's page at that moment: the exam page, or where the
        // tab went (navigating away ends fullscreen by itself).
        out.push(entry(ev, ev.type, !ev.url ? '' : submissionPage(ev.url) ? 'on submitting the exam'
          : onExamPage(ev.url) ? 'on the exam page' : `tab moved to ${shortUrl(ev.url)}`));
        continue;
    }

    let kind = ev.type;
    if (/^(chrome|edge):\/\/extensions/i.test(ev.url || '')) kind = 'EXTENSION_SETTINGS';
    else if (ev.type === 'NEW_WINDOW' && payload?.incognito === true) kind = 'INCOGNITO_WINDOW';
    const hp = hostPath(ev.url);
    const e = entry(ev, kind, shortUrl(ev.url));

    // One action, several events: merge into the previous tab row.
    const prev = out[out.length - 1];
    if (
      prev && TAB_KINDS.includes(kind) && TAB_KINDS.includes(prev.kind) &&
      ev.occurredAt.getTime() - prev.at.getTime() <= MERGE_WINDOW_MS && hostPath(prev.url) === hp
    ) {
      if (TAB_KINDS.indexOf(kind) > TAB_KINDS.indexOf(prev.kind)) prev.kind = kind;
      prev.concerning ||= e.concerning;
      prev.postSubmission &&= e.postSubmission;
      continue;
    }
    // Same page again (query-only change, or the page shown after submitting).
    if (kind === 'TAB_NAVIGATE' && hp && hp === lastPage && !e.concerning) continue;

    if (PAGE_KINDS.has(kind) && hp) lastPage = hp;
    out.push(e);
  }
  return out;
}

export function fmtGap(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}
