// Room URLs carry a public code only; player identity never leaves session storage.
export function invitationCode(value: string): string | null {
  const input = value.trim();
  if (!input) return null;
  if (/^[a-z0-9]{6}$/i.test(input)) return input.toUpperCase();
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const code = url.searchParams.get('room')?.toUpperCase();
    return code && /^[A-Z0-9]{6}$/.test(code) ? code : null;
  } catch { return null; }
}
