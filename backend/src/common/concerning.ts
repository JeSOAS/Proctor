import { DomainRule, isAiHost, isAllowedUrl, ruleMatches } from './allowed-domains';

// A bare window blur (student left the whole Chrome window, no navigation)
// counts as a warning only if they stayed away at least this long. Shorter
// blurs are recorded but not counted — leaving the window for a few seconds
// isn't evidence of cheating. (Policy chosen with the user: "count only if long".)
const CONCERNING_BLUR_MS = 30_000;

// Browser-internal pages are never a violation — opening a new tab lands on one.
const ALLOWED_SCHEMES = new Set([
  'chrome:',
  'about:',
  'chrome-extension:',
  'edge:',
  'devtools:',
  'view-source:',
]);

export interface ClassifiableEvent {
  id: number;
  type: string;
  url: string | null;
  occurredAt: Date;
}

export interface ClassifyResult {
  /** Event ids that count as real (concerning) violations. */
  concerning: Set<number>;
  /** Event ids that happened AFTER the student submitted — recorded, flagged, not counted. */
  postSubmission: Set<number>;
  /** The student navigated to a known AI tool at least once. */
  aiUsed: boolean;
  /** The student visited the exam's required link (only meaningful if one is set). */
  visitedExamLink: boolean;
  /** When the student first opened the exam page (EXAM_STARTED, or first exam-host visit). */
  examStartedAt: Date | null;
  /** When the student submitted the exam (EXAM_SUBMITTED), if detected. */
  submittedAt: Date | null;
}

/** Extract a bare host from a domain OR a full URL a teacher typed as the exam link. */
export function hostOf(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const raw = value.trim();
  if (!raw) return undefined;
  try {
    return new URL(raw).host.toLowerCase();
  } catch {
    // Not a full URL — treat it as a bare domain, stripping any path.
    return raw.toLowerCase().replace(/^https?:\/\//, '').split('/')[0] || undefined;
  }
}

function parse(url: string | null): {
  host?: string;
  pathname?: string;
  hostPath?: string;
  scheme?: string;
} {
  if (!url) return {};
  try {
    const u = new URL(url);
    return { host: u.host, pathname: u.pathname, hostPath: u.host + u.pathname, scheme: u.protocol };
  } catch {
    return {};
  }
}

// Scope the exam link to host + its first path segment, so setting the exam link
// to a Google Form (docs.google.com/forms/...) whitelists /forms — NOT all of
// docs.google.com (which would re-open the saved-Doc loophole).
function examLinkRule(examLink: string | null | undefined): DomainRule | null {
  const host = hostOf(examLink);
  if (!host) return null;
  let firstSeg = '';
  try {
    const raw = examLink!.trim();
    const u = new URL(raw.startsWith('http') ? raw : 'https://' + raw);
    firstSeg = u.pathname.split('/')[1] || '';
  } catch {
    /* bare domain — no path scope */
  }
  return firstSeg ? { host, path: '/' + firstSeg } : { host };
}

/**
 * Turn a session's raw, time-ordered events into a meaningful warning signal.
 * Three tiers:
 *   - AI (chatgpt/gemini/claude/…) — sets aiUsed AND counts;
 *   - Concerning (counts) — navigation/tab/clipboard to a site that is NOT
 *     whitelisted, the exam link, or a browser-internal page;
 *   - Minor (logged, never counted) — a short window blur, a tab switch/open
 *     that lands on a whitelisted/blank/internal page, or the same page being
 *     re-stamped with a new query string.
 * The raw events are never discarded; this only decides what counts.
 */
export function classify(
  events: ClassifiableEvent[],
  opts: { examLink?: string | null } = {},
): ClassifyResult {
  const examRule = examLinkRule(opts.examLink);
  const concerning = new Set<number>();
  const postSubmission = new Set<number>();
  let aiUsed = false;
  let visitedExamLink = false;
  let examStartedAt: Date | null = null;
  let submittedAt: Date | null = null;
  let lastNavHostPath: string | undefined;
  let pendingBlur: ClassifiableEvent | null = null;

  // Once the student has submitted, later events are recorded but never counted
  // — they've finished, so it isn't cheating. flag() routes accordingly.
  const flag = (id: number) => (submittedAt ? postSubmission : concerning).add(id);

  // Allowed = whitelist, OR the exam's own link, OR a browser-internal scheme,
  // OR a blank/unknown target (no URL). Returns true when the target is benign.
  const isAllowedTarget = (url: string | null): boolean => {
    if (!url) return true; // blank new tab / unknown — not evidence
    const { host, pathname, scheme } = parse(url);
    if (scheme && ALLOWED_SCHEMES.has(scheme)) return true;
    if (examRule && ruleMatches(examRule, host, pathname || '/')) return true;
    return isAllowedUrl(host, pathname || '/');
  };

  const noteVisit = (url: string | null) => {
    if (!url) return;
    const { host, pathname } = parse(url);
    // AI detection is independent of whether an exam link is configured.
    if (isAiHost(host)) aiUsed = true;
    // Visiting the exam link (path-scoped) counts as opening the exam.
    if (examRule && ruleMatches(examRule, host, pathname || '/')) visitedExamLink = true;
  };

  for (const ev of events) {
    switch (ev.type) {
      case 'EXAM_STARTED':
        if (!examStartedAt) examStartedAt = ev.occurredAt;
        visitedExamLink = true;
        break;

      case 'EXAM_SUBMITTED':
        if (!submittedAt) submittedAt = ev.occurredAt;
        break;

      case 'WINDOW_BLUR':
        pendingBlur = ev; // undecided until we see if/when focus returns
        break;

      case 'WINDOW_FOCUS':
        if (pendingBlur) {
          const away = ev.occurredAt.getTime() - pendingBlur.occurredAt.getTime();
          if (away >= CONCERNING_BLUR_MS) flag(pendingBlur.id);
          pendingBlur = null;
        }
        break;

      case 'TAB_NAVIGATE':
      case 'TAB_SWITCH': {
        noteVisit(ev.url);
        const { hostPath } = parse(ev.url);
        if (hostPath && hostPath === lastNavHostPath) break; // same page, query-only change
        if (hostPath) lastNavHostPath = hostPath;
        if (!isAllowedTarget(ev.url)) flag(ev.id);
        break;
      }

      case 'TAB_CREATED':
        noteVisit(ev.url);
        // Opening a tab is only concerning if it lands somewhere non-allowed.
        // A blank/new-tab (no URL / chrome://newtab) is benign — the student's
        // later navigation, if any, is judged on its own.
        if (!isAllowedTarget(ev.url)) flag(ev.id);
        break;

      case 'COPY':
      case 'PASTE':
      case 'CUT':
        noteVisit(ev.url);
        // Clipboard use on the exam / an allowed page is fine (e.g. the password
        // paste at login). Copying on an outside site is the real signal.
        if (!isAllowedTarget(ev.url)) flag(ev.id);
        break;

      case 'LONG_DISCONNECT':
        flag(ev.id); // no URL context; a significant disconnect always counts
        break;

      default:
        break; // TAB_CLOSED / WINDOW_FOCUS / RECONNECT etc. are never concerning
    }
  }

  // A blur that never got a matching focus = they left and didn't return.
  if (pendingBlur) flag(pendingBlur.id);

  return { concerning, postSubmission, aiUsed, visitedExamLink, examStartedAt, submittedAt };
}

/** Backwards-compatible helper: just the set of concerning event ids. */
export function concerningIds(
  events: ClassifiableEvent[],
  opts: { examLink?: string | null } = {},
): Set<number> {
  return classify(events, opts).concerning;
}
