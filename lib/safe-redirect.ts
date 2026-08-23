// Guards against open-redirect: `next` comes from a query string an
// attacker controls (e.g. /auth/callback?next=//evil.com or
// ?next=@evil.com/x, which browsers resolve off-origin even though it
// looks like a relative path). Only a single-segment relative path is
// ever allowed through.
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
