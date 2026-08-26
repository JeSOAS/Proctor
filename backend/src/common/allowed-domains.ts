import { readFileSync } from 'fs';
import { join } from 'path';

// Loads the whitelist of exam/infrastructure domains from allowed-domains.txt
// (repo root of the backend). Activity on these domains is not counted as a
// violation — see that file for the rationale and format. The file is the
// source of truth teachers edit; this array is only a fallback used if the file
// can't be found, so keep the two roughly in sync.
const DEFAULT_ALLOWED = [
  'accounts.google.com',
  'docs.google.com',
  'forms.gle',
  'www.google.com',
  'gstatic.com',
  'fonts.googleapis.com',
  'googleusercontent.com',
];

let cached: string[] | null = null;

/** The list of allowed domain suffixes, loaded once and cached. */
export function allowedDomains(): string[] {
  if (cached) return cached;
  // In Docker the backend runs with cwd /app and the file is copied to
  // /app/allowed-domains.txt; locally it runs from backend/, so cwd works too.
  // The __dirname candidate (dist/common → app root) is a belt-and-braces
  // fallback. ALLOWED_DOMAINS_FILE lets an operator point somewhere else.
  const candidates = [
    process.env.ALLOWED_DOMAINS_FILE,
    join(process.cwd(), 'allowed-domains.txt'),
    join(__dirname, '..', '..', 'allowed-domains.txt'),
  ].filter((p): p is string => !!p);

  for (const path of candidates) {
    try {
      cached = parse(readFileSync(path, 'utf8'));
      console.log(`[proctor] loaded ${cached.length} allowed domains from ${path}`);
      return cached;
    } catch {
      // try the next candidate
    }
  }
  console.warn('[proctor] allowed-domains.txt not found; using built-in defaults');
  cached = DEFAULT_ALLOWED;
  return cached;
}

function parse(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, '').trim().toLowerCase()) // strip comments
    .filter(Boolean)
    .map((d) => d.replace(/^(\*\.|\.)/, '')); // tolerate "*.x" / ".x"
}

/** True if `host` is (or is a subdomain of) any allowed domain. */
export function isAllowedHost(host: string | undefined | null): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  return allowedDomains().some((d) => h === d || h.endsWith('.' + d));
}
