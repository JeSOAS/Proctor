import { isAllowedHost } from './allowed-domains';

// A window blur shorter than this (focus comes back within it) is treated as a
// harmless flicker — e.g. the focus bounce during a login redirect — not a
// real "the student switched away" event.
const BLUR_GRACE_MS = 5_000;

export interface ClassifiableEvent {
  id: number;
  type: string;
  url: string | null;
  occurredAt: Date;
}

function parseUrl(url: string | null): { host?: string; hostPath?: string } {
  if (!url) return {};
  try {
    const u = new URL(url);
    return { host: u.host, hostPath: u.host + u.pathname };
  } catch {
    return {};
  }
}

/**
 * Given a session's events in time order, returns the ids of the events that
 * count as real (concerning) violations. This is where raw browser events get
 * turned into a meaningful warning signal, filtering out the noise of taking
 * the exam normally:
 *
 *   (a) a navigation / tab switch / new tab / clipboard action on an allowed
 *       domain (see allowed-domains.txt) is not concerning — this is what kills
 *       the login-redirect and password-paste false positives;
 *   (b) a navigation that only changes the query/hash of the same page (host +
 *       path unchanged) is not concerning — Google keeps re-stamping the form
 *       URL with ?ts=... which isn't really navigating anywhere;
 *   (c) a window blur is concerning only if focus doesn't return within
 *       BLUR_GRACE_MS — a brief blur/focus flicker doesn't count, but leaving
 *       the window for real does.
 *
 * The raw events are never discarded; this only decides what counts.
 */
export function concerningIds(events: ClassifiableEvent[]): Set<number> {
  const concerning = new Set<number>();
  let lastNavHostPath: string | undefined;
  let pendingBlur: ClassifiableEvent | null = null;

  for (const ev of events) {
    switch (ev.type) {
      case 'WINDOW_BLUR':
        // Undecided until we see whether/when focus returns.
        pendingBlur = ev;
        break;

      case 'WINDOW_FOCUS':
        if (pendingBlur) {
          const gap = ev.occurredAt.getTime() - pendingBlur.occurredAt.getTime();
          if (gap >= BLUR_GRACE_MS) concerning.add(pendingBlur.id); // (c)
          pendingBlur = null;
        }
        break;

      case 'TAB_NAVIGATE':
      case 'TAB_SWITCH': {
        const { host, hostPath } = parseUrl(ev.url);
        if (hostPath && hostPath === lastNavHostPath) break; // (b) same page
        if (hostPath) lastNavHostPath = hostPath;
        if (!isAllowedHost(host)) concerning.add(ev.id); // (a)
        break;
      }

      case 'TAB_CREATED':
      case 'COPY':
      case 'PASTE':
      case 'CUT':
        if (!isAllowedHost(parseUrl(ev.url).host)) concerning.add(ev.id); // (a)
        break;

      case 'LONG_DISCONNECT':
        // No URL context; a significant disconnect always counts.
        concerning.add(ev.id);
        break;

      default:
        // WINDOW_FOCUS handled above; TAB_CLOSED / RECONNECT are never concerning.
        break;
    }
  }

  // A blur that never got a matching focus = the student left and didn't return.
  if (pendingBlur) concerning.add(pendingBlur.id);

  return concerning;
}
