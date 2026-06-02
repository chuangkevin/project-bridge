/**
 * Minimal frontmatter parser for the client. Avoids pulling gray-matter
 * (~70KB+ minified including js-yaml) into the bundle just for parsing skill
 * frontmatter, where we only need `name` and `description` as strings.
 *
 * Supports:
 *   - leading `---\n...---\n` block
 *   - `key: value` lines (value may be quoted with " or '; quotes stripped)
 *   - lines that don't match `key: value` are ignored
 *
 * Not supported (use server-side parsing if needed):
 *   - nested objects, arrays, multi-line values, JSON in values.
 */

export interface FrontmatterParseResult {
  data: Record<string, string>;
  content: string;
}

export function parseFrontmatter(raw: string): FrontmatterParseResult {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) return { data: {}, content: raw };
  const [, fm, body] = m;
  const data: Record<string, string> = {};
  for (const line of fm.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim();
    let value = trimmed.slice(colon + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) data[key] = value;
  }
  return { data, content: body };
}
