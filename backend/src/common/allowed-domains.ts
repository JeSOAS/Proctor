import { readFileSync } from 'fs';
import { join } from 'path';

// Loads the domain lists from the plain-text files at the backend root
// (allowed-domains.txt, ai-domains.txt) — those files are the source of truth
// teachers edit; the DEFAULT_* arrays are only a fallback if a file is missing,
// so keep them roughly in sync. See each .txt for the rationale and format.
//
// The allowed list is intentionally NARROW and PATH-AWARE: an entry may be just
// a host (e.g. "accounts.google.com" — any path) OR a host + path prefix (e.g.
// "docs.google.com/forms" — matches ONLY /forms..., so Google Docs/Sheets on
// the same host are NOT whitelisted). The AI list is host-only.

const DEFAULT_ALLOWED = ['accounts.google.com', 'docs.google.com/forms', 'forms.gle'];

const DEFAULT_AI = [
  'chatgpt.com',
  'chat.openai.com',
  'openai.com',
  'gemini.google.com',
  'claude.ai',
  'copilot.microsoft.com',
  'perplexity.ai',
  'openrouter.ai',
];

export interface DomainRule {
  host: string;
  /** Path prefix (with leading slash, no trailing slash), e.g. "/forms". Absent = any path. */
  path?: string;
}

/** Parse one list entry ("host" or "host/path") into a rule. */
export function parseRule(entry: string): DomainRule {
  const clean = entry
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^(\*\.|\.)/, '');
  const i = clean.indexOf('/');
  if (i === -1) return { host: clean };
  const host = clean.slice(0, i);
  const path = clean.slice(i).replace(/\/+$/, ''); // strip trailing slash(es)
  return path ? { host, path } : { host };
}

/** Does a URL's host + path satisfy this rule? Host matches by suffix; path (if
 *  the rule has one) must be that segment or a child of it. */
export function ruleMatches(rule: DomainRule, host: string | undefined | null, pathname: string): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  if (!(h === rule.host || h.endsWith('.' + rule.host))) return false;
  if (!rule.path) return true;
  const p = pathname || '/';
  return p === rule.path || p.startsWith(rule.path + '/');
}

function loadRaw(filename: string, defaults: string[]): string[] {
  // In Docker the backend runs with cwd /app and the file is copied to
  // /app/<filename>; locally it runs from backend/, so cwd works too. The
  // __dirname candidate (dist/common → app root) is a belt-and-braces fallback.
  const candidates = [join(process.cwd(), filename), join(__dirname, '..', '..', filename)];
  for (const path of candidates) {
    try {
      const list = parseLines(readFileSync(path, 'utf8'));
      console.log(`[proctor] loaded ${list.length} entries from ${path}`);
      return list;
    } catch {
      // try the next candidate
    }
  }
  console.warn(`[proctor] ${filename} not found; using built-in defaults`);
  return defaults;
}

function parseLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, '').trim().toLowerCase())
    .filter(Boolean);
}

let allowedCache: DomainRule[] | null = null;
let aiCache: string[] | null = null;

export function allowedRules(): DomainRule[] {
  return (allowedCache ??= loadRaw('allowed-domains.txt', DEFAULT_ALLOWED).map(parseRule));
}

export function aiDomains(): string[] {
  // AI is matched host-only; drop any accidental path.
  return (aiCache ??= loadRaw('ai-domains.txt', DEFAULT_AI).map((e) => parseRule(e).host));
}

/** True if the host+path is allowed by the (path-aware) whitelist. */
export function isAllowedUrl(host: string | undefined | null, pathname: string): boolean {
  return allowedRules().some((r) => ruleMatches(r, host, pathname));
}

/** True if `host` is (or is a subdomain of) a known AI tool. */
export function isAiHost(host: string | undefined | null): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  return aiDomains().some((d) => h === d || h.endsWith('.' + d));
}
