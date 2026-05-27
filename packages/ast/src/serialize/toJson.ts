import type { SemanticUIAst } from '../types/ast';

// Returns undefined for a value that JSON would omit (i.e. `undefined`); callers handle that.
function stableStringify(value: unknown): string | undefined {
  if (typeof value === 'undefined') return undefined;
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    // JSON semantics: an undefined array slot serializes to null.
    return `[${value.map(v => stableStringify(v) ?? 'null').join(',')}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const props = keys
    .map(k => {
      const sv = stableStringify((value as Record<string, unknown>)[k]);
      // JSON semantics: an object key whose value is undefined is omitted entirely.
      return sv === undefined ? undefined : `${JSON.stringify(k)}:${sv}`;
    })
    .filter((p): p is string => p !== undefined);
  return `{${props.join(',')}}`;
}

export function toJson(ast: SemanticUIAst, opts: { pretty?: boolean } = {}): string {
  // Stable key order → git-friendly. Pretty mode parses and re-emits for human reading.
  const stable = stableStringify(ast) ?? 'null';
  if (!opts.pretty) return stable;
  return JSON.stringify(JSON.parse(stable), null, 2);
}
