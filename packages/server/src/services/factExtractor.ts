import type { FactKind } from './factService.js';

const ALLOWED_KINDS = new Set<string>(['requirement', 'page', 'constraint', 'decision']);

export interface ParsedFact { kind: FactKind; text: string; }

const FACTS_BLOCK_RE = /<facts>\s*([\s\S]*?)\s*<\/facts>/i;

export function parseFactsFromResponse(aiResponseText: string): ParsedFact[] {
  const match = aiResponseText.match(FACTS_BLOCK_RE);
  if (!match) return [];
  let raw: unknown;
  try { raw = JSON.parse(match[1]!); }
  catch { return []; }
  if (!Array.isArray(raw)) return [];

  const out: ParsedFact[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const kind = typeof obj.kind === 'string' ? obj.kind : '';
    const rawText = typeof obj.text === 'string' ? obj.text : '';
    const text = rawText.trim();
    if (!ALLOWED_KINDS.has(kind) || !text) continue;
    out.push({ kind: kind as FactKind, text });
  }
  return out;
}
