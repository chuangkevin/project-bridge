import type { SemanticUIAst } from '../types/ast';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const props = keys.map(k => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`);
  return `{${props.join(',')}}`;
}

export function toJson(ast: SemanticUIAst, opts: { pretty?: boolean } = {}): string {
  const stable = stableStringify(ast);
  if (!opts.pretty) return stable;
  return JSON.stringify(JSON.parse(stable), null, 2);
}
