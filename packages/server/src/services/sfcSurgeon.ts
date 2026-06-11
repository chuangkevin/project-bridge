/**
 * sfcSurgeon — Vue SFC template parsing utilities.
 *
 * Phase 1 scope: template block extraction + structure summarization for
 * oversized-artifact prompt degradation (design-generation-context spec).
 * Phase 2 extends this module with subtree locate/extract/replace for
 * dual-track editing (sfc-element-editing spec).
 *
 * Parser choice: htmlparser2 — tolerates Vue template syntax (@click, v-if,
 * {{ }}, attribute values containing `>`) without HTML5 normalization
 * (parse5 would inject tbody etc. and break round-trip fidelity).
 */
import { parseDocument } from 'htmlparser2';
import type { Document, Element, AnyNode } from 'domhandler';

const PARSE_OPTS = {
  recognizeSelfClosing: true,
  lowerCaseTags: false,
  lowerCaseAttributeNames: false,
} as const;

export interface SfcBlocks {
  /** Content INSIDE <template>...</template> (outermost only). */
  template: string;
  /** Everything before the template open tag (usually empty). */
  before: string;
  /** Everything after the template close tag (script + style blocks). */
  after: string;
  /** Index of template content start in the original source. */
  templateStart: number;
}

/**
 * Split an SFC into template content and surrounding blocks by parsing the
 * whole SFC and slicing on the outermost <template> element's node indices.
 * Returns null when no top-level <template> block is found.
 */
export function splitSfcBlocks(source: string): SfcBlocks | null {
  const doc = parseDocument(source, { ...PARSE_OPTS, withStartIndices: true, withEndIndices: true });
  const tpl = doc.children.find((n): n is Element => isElement(n) && n.name === 'template');
  if (!tpl || tpl.startIndex == null || tpl.endIndex == null) return null;

  // endIndex points at the final '>' of the closing tag; locate where the
  // closing tag begins so we can slice out the inner content exactly.
  const closeStart = source.lastIndexOf('</', tpl.endIndex);
  if (closeStart < 0) return null;

  const children = tpl.children ?? [];
  const first = children.find((c) => c.startIndex != null);
  const contentStart = first?.startIndex ?? closeStart;

  return {
    template: source.slice(contentStart, closeStart),
    before: source.slice(0, tpl.startIndex),
    after: source.slice(tpl.endIndex + 1),
    templateStart: contentStart,
  };
}

/** Parse template HTML into a DOM. Exported for reuse by later phases. */
export function parseTemplate(template: string): Document {
  return parseDocument(template, PARSE_OPTS);
}

// ─── Subtree locate / extract / replace (sfc-element-editing spec) ─────────
//
// Element paths are sequences of ELEMENT-child indices rooted at the outer
// <template>'s element children, e.g. [0, 2, 1] = first element child's third
// element child's second element child. The client-side instrumenter
// (sfcRuntime.instrumentTemplate) MUST produce identical semantics — both
// sides count element nodes only, skipping text/comment nodes.
//
// All edits splice the ORIGINAL source string using parser node indices, so
// untouched regions stay byte-identical (round-trip fidelity requirement).

export interface LocatedElement {
  tag: string;
  /** Absolute offsets into the full SFC source; end is exclusive. */
  start: number;
  end: number;
  /** Verbatim source slice of the subtree. */
  source: string;
}

function elementChildren(node: Document | Element): Element[] {
  return (node.children ?? []).filter(isElement);
}

/** Locate the element addressed by `path` inside the SFC's template block. */
export function locateByPath(sfc: string, path: number[]): LocatedElement | null {
  if (!Array.isArray(path) || path.length === 0 || path.some(i => !Number.isInteger(i) || i < 0)) return null;
  const doc = parseDocument(sfc, { ...PARSE_OPTS, withStartIndices: true, withEndIndices: true });
  const tpl = doc.children.find((n): n is Element => isElement(n) && n.name === 'template');
  if (!tpl) return null;

  let current: Element | undefined;
  let scope: Element[] = elementChildren(tpl);
  for (const idx of path) {
    current = scope[idx];
    if (!current) return null;
    scope = elementChildren(current);
  }
  if (!current || current.startIndex == null || current.endIndex == null) return null;
  const start = current.startIndex;
  const end = current.endIndex + 1;
  return { tag: current.name, start, end, source: sfc.slice(start, end) };
}

/**
 * Validate that a replacement snippet is a single well-formed element
 * (whitespace and comments around it are tolerated and trimmed away).
 */
export function validateSubtree(snippet: string): { ok: true; element: string } | { ok: false; reason: string } {
  const doc = parseDocument(snippet, { ...PARSE_OPTS, withStartIndices: true, withEndIndices: true });
  const elements = elementChildren(doc);
  if (elements.length === 0) return { ok: false, reason: '回傳內容沒有任何元素節點' };
  if (elements.length > 1) return { ok: false, reason: `回傳內容有 ${elements.length} 個根元素，必須恰好一個` };
  const stray = (doc.children ?? []).some(n => n.type === 'text' && ((n as { data?: string }).data ?? '').trim() !== '');
  if (stray) return { ok: false, reason: '元素外存在非空白文字' };
  const el = elements[0];
  if (el.startIndex == null || el.endIndex == null) return { ok: false, reason: '無法定位元素邊界' };
  return { ok: true, element: snippet.slice(el.startIndex, el.endIndex + 1) };
}

/** Replace the subtree at `path` with `snippet`. Untouched content is byte-identical. */
export function replaceByPath(
  sfc: string,
  path: number[],
  snippet: string,
): { ok: true; sfc: string; tag: string } | { ok: false; reason: string } {
  const valid = validateSubtree(snippet);
  if (!valid.ok) return valid;
  const located = locateByPath(sfc, path);
  if (!located) return { ok: false, reason: `路徑 [${path.join('/')}] 在 template 中定位失敗` };
  const next = sfc.slice(0, located.start) + valid.element + sfc.slice(located.end);
  // Re-parse to guarantee the spliced document still has a sane template.
  if (!splitSfcBlocks(next)) return { ok: false, reason: '替換後的 SFC 無法解析 template 區塊' };
  return { ok: true, sfc: next, tag: located.tag };
}

/**
 * Collect <style> rules related to a subtree by class-token matching.
 * Intentionally over-inclusive (寧多勿漏) — extra context is harmless,
 * missing context makes the AI invent styles.
 */
export function relatedStyles(sfc: string, subtreeSource: string): string {
  const styleBlocks: string[] = [];
  const doc = parseDocument(sfc, { ...PARSE_OPTS, withStartIndices: true, withEndIndices: true });
  const collect = (nodes: AnyNode[]): void => {
    for (const n of nodes) {
      if (isElement(n) && n.name === 'style') styleBlocks.push(textOf(n));
      else if (isElement(n)) collect(n.children ?? []);
    }
  };
  collect(doc.children);
  if (styleBlocks.length === 0) return '';

  const tokens = new Set<string>();
  const subDoc = parseTemplate(subtreeSource);
  const walkClasses = (nodes: AnyNode[]): void => {
    for (const n of nodes) {
      if (!isElement(n)) continue;
      for (const attr of ['class', ':class']) {
        const v = n.attribs?.[attr];
        if (v) for (const t of v.split(/[^A-Za-z0-9_-]+/)) if (t) tokens.add(t);
      }
      walkClasses(n.children ?? []);
    }
  };
  walkClasses(subDoc.children);
  if (tokens.size === 0) return '';

  const kept: string[] = [];
  for (const block of styleBlocks) {
    for (const rule of block.split('}')) {
      const trimmed = rule.trim();
      if (!trimmed) continue;
      if ([...tokens].some(t => trimmed.includes(`.${t}`))) kept.push(trimmed + '}');
    }
  }
  return kept.join('\n');
}

function isElement(node: AnyNode): node is Element {
  return node.type === 'tag' || node.type === 'script' || node.type === 'style';
}

function textOf(node: AnyNode): string {
  if (node.type === 'text') return (node as { data?: string }).data ?? '';
  if (isElement(node)) return (node.children ?? []).map(textOf).join('');
  return '';
}

/**
 * Produce a compact structural summary of an SFC for prompt degradation when
 * the full source exceeds the injection limit. Captures: page branches
 * (v-if/v-show), interactive elements, headings, and tag statistics.
 */
export function summarizeSfcStructure(source: string): string {
  const blocks = splitSfcBlocks(source);
  if (!blocks) return '(無法解析 template 區塊)';
  const doc = parseTemplate(blocks.template);

  const pages: string[] = [];
  const navLabels: string[] = [];
  const headings: string[] = [];
  const tagCounts = new Map<string, number>();

  const walk = (nodes: AnyNode[]): void => {
    for (const node of nodes) {
      if (!isElement(node)) continue;
      const el = node;
      const tag = el.name;
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);

      const vif = el.attribs?.['v-if'] ?? el.attribs?.['v-show'] ?? el.attribs?.['v-else-if'];
      if (vif) pages.push(vif);

      if ((tag === 'button' || tag === 'a') && el.attribs?.['@click']) {
        const label = textOf(el).replace(/\s+/g, ' ').trim().slice(0, 40);
        if (label) navLabels.push(`${label} → ${el.attribs['@click']}`);
      }
      if (/^h[1-6]$/.test(tag)) {
        const label = textOf(el).replace(/\s+/g, ' ').trim().slice(0, 60);
        if (label) headings.push(`${tag}: ${label}`);
      }
      walk(el.children ?? []);
    }
  };
  walk(doc.children);

  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([t, n]) => `${t}×${n}`)
    .join(', ');

  const sections: string[] = [];
  if (pages.length) sections.push(`條件分支（頁面/區塊切換）:\n${[...new Set(pages)].slice(0, 30).map(p => `- ${p}`).join('\n')}`);
  if (navLabels.length) sections.push(`互動元素:\n${[...new Set(navLabels)].slice(0, 30).map(p => `- ${p}`).join('\n')}`);
  if (headings.length) sections.push(`標題結構:\n${headings.slice(0, 40).map(h => `- ${h}`).join('\n')}`);
  sections.push(`元素統計: ${topTags}`);
  return sections.join('\n\n');
}
