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
