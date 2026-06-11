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
