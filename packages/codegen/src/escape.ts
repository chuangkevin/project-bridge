export function escapeHtml(value: string): string {
  if (typeof value !== 'string') return '';
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(value: string): string {
  if (typeof value !== 'string') return '';
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Sanitize a value for a Tailwind arbitrary `[...]`. Spaces → underscores. Returns null if empty or
 * containing characters that break the class token / attribute (`]`, quotes, `<`, `>`, backslash, other whitespace).
 */
export function sanitizeArbitrary(value: string): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (/[\]"'<>\\\n\r\t]/.test(trimmed)) return null;
  return trimmed.replace(/ /g, '_');
}

/**
 * Sanitize a full Tailwind class TOKEN (e.g. "font-bold", "p-[16px]", "hover:bg-[#fff]").
 * Allows class-token characters incl. brackets/#/:/./()%/-/_ but rejects anything that could
 * break the double-quoted class attribute or inject markup: quotes, `<`, `>`, backslash, whitespace.
 * Returns null to omit. (Whitespace is rejected so callers must pass ONE token at a time.)
 */
export function sanitizeClassToken(value: string): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (t.length === 0) return null;
  if (/["'<>\\\s]/.test(t)) return null;
  return t;
}
