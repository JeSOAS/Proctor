import { timingSafeEqual } from 'crypto';

/// Constant-time comparison for shared secrets (admin token, webhook secret), so
/// the response time reveals nothing about how much of a guess was right.
export function safeEqual(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
