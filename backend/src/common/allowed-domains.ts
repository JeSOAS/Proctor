import { readFileSync } from 'fs';
import { join } from 'path';

// Loads the domain lists from the plain-text files at the backend root
// (allowed-domains.txt, ai-domains.txt) — those files are the source of truth
// teachers edit; the DEFAULT_* arrays are only a fallback if a file is missing,
// so keep them roughly in sync. See each .txt for the rationale and format.

const DEFAULT_ALLOWED = [
  'accounts.google.com',
  'docs.google.com',
  'forms.gle',
  'www.google.com',
  'gstatic.com',
  'fonts.googleapis.com',
  'googleusercontent.com',
  'teams.microsoft.com',
  'login.microsoftonline.com',
  'sharepoint.com',
  'office.com',
  'au.edu',
];

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

function loadList(filename: string, defaults: string[]): string[] {
  // In Docker the backend runs with cwd /app and the file is copied to
  // /app/<filename>; locally it runs from backend/, so cwd works too. The
  // __dirname candidate (dist/common → app root) is a belt-and-braces fallback.
  const candidates = [
    join(process.cwd(), filename),
    join(__dirname, '..', '..', filename),
  ];
  for (const path of candidates) {
    try {
      const list = parse(readFileSync(path, 'utf8'));
      console.log(`[proctor] loaded ${list.length} domains from ${path}`);
      return list;
    } catch {
      // try the next candidate
    }
  }
  console.warn(`[proctor] ${filename} not found; using built-in defaults`);
  return defaults;
}

function parse(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, '').trim().toLowerCase()) // strip comments
    .filter(Boolean)
    .map((d) => d.replace(/^(\*\.|\.)/, '')); // tolerate "*.x" / ".x"
}

let allowedCache: string[] | null = null;
let aiCache: string[] | null = null;

export function allowedDomains(): string[] {
  return (allowedCache ??= loadList('allowed-domains.txt', DEFAULT_ALLOWED));
}

export function aiDomains(): string[] {
  return (aiCache ??= loadList('ai-domains.txt', DEFAULT_AI));
}

/** True if `host` is (or is a subdomain of) any domain in `list`. */
export function hostInList(host: string | undefined | null, list: string[]): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  return list.some((d) => h === d || h.endsWith('.' + d));
}

export function isAllowedHost(host: string | undefined | null): boolean {
  return hostInList(host, allowedDomains());
}

export function isAiHost(host: string | undefined | null): boolean {
  return hostInList(host, aiDomains());
}
