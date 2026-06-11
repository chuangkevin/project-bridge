/**
 * componentLibrary — prompt index + verbatim placeholder expansion
 * (component-library spec).
 *
 * Reuse contract: the AI references library components ONLY as
 * `<lib-component name="..."/>` placeholders; expansion happens here, server
 * side, with the stored template inserted VERBATIM. The AI never retypes
 * component source, so refined components cannot drift.
 */
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { parseDocument } from 'htmlparser2';
import type { Element, AnyNode } from 'domhandler';

export interface LibComponent {
  id: string;
  projectId: string | null;
  name: string;
  category: string;
  description: string;
  html: string;
  css: string;
  version: number;
}

function rowToComponent(row: Record<string, unknown>): LibComponent {
  return {
    id: row.id as string,
    projectId: (row.project_id as string | null) ?? null,
    name: row.name as string,
    category: row.category as string,
    description: (row.description as string) ?? '',
    html: row.html as string,
    css: (row.css as string) ?? '',
    version: row.version as number,
  };
}

/** Components visible to a project: its own + global (project_id IS NULL).
 *  Project-scoped names shadow global ones. */
export function listVisibleComponents(db: Database.Database, projectId: string): LibComponent[] {
  const rows = db.prepare(
    `SELECT * FROM components WHERE project_id = ? OR project_id IS NULL ORDER BY project_id IS NULL, updated_at DESC`,
  ).all(projectId) as Array<Record<string, unknown>>;
  const seen = new Set<string>();
  const out: LibComponent[] = [];
  for (const row of rows) {
    const c = rowToComponent(row);
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    out.push(c);
  }
  return out;
}

const INDEX_CAP = 50;

/** Prompt block: component index + placeholder usage rules. Empty string when
 *  the library has nothing to offer. */
export function componentIndexBlock(db: Database.Database, projectId: string): string {
  const components = listVisibleComponents(db, projectId).slice(0, INDEX_CAP);
  if (components.length === 0) return '';
  const lines = components.map(c => {
    const desc = c.description || c.category || '';
    return `- ${c.name}${desc ? `: ${desc}` : ''}`;
  });
  return [
    '## 元件庫（必須優先使用）',
    'The component library below contains user-refined, approved components.',
    'When the design needs one of them, output EXACTLY `<lib-component name="<name>"/>` at that position.',
    'NEVER retype, modify, or approximate a library component\'s markup — the server expands the placeholder verbatim.',
    'Only reference names from this list:',
    ...lines,
  ].join('\n');
}

export interface ExpansionResult {
  payload: string;
  expanded: string[];
  unknown: string[];
  /** css of expanded components, deduped, to merge into the SFC style block */
  injectedCss: string;
}

function isElement(node: AnyNode): node is Element {
  return node.type === 'tag' || node.type === 'script' || node.type === 'style';
}

/**
 * Expand `<lib-component name="..."/>` placeholders in an SFC payload with
 * stored component templates, verbatim. Unknown names become a warning
 * container so the artifact still previews (spec: 不整筆作廢).
 */
export function expandLibComponents(db: Database.Database, projectId: string, payload: string): ExpansionResult {
  const doc = parseDocument(payload, {
    recognizeSelfClosing: true,
    lowerCaseTags: false,
    lowerCaseAttributeNames: false,
    withStartIndices: true,
    withEndIndices: true,
  });

  const placeholders: Array<{ start: number; end: number; name: string }> = [];
  const walk = (nodes: AnyNode[]): void => {
    for (const n of nodes) {
      if (!isElement(n)) continue;
      if (n.name === 'lib-component' && n.startIndex != null && n.endIndex != null) {
        placeholders.push({ start: n.startIndex, end: n.endIndex + 1, name: (n.attribs?.name ?? '').trim() });
        continue; // do not descend into placeholders
      }
      walk(n.children ?? []);
    }
  };
  walk(doc.children);

  if (placeholders.length === 0) return { payload, expanded: [], unknown: [], injectedCss: '' };

  const visible = new Map(listVisibleComponents(db, projectId).map(c => [c.name, c]));
  const expanded: string[] = [];
  const unknown: string[] = [];
  const cssChunks: string[] = [];

  let out = payload;
  for (const ph of placeholders.sort((a, b) => b.start - a.start)) {
    const component = ph.name ? visible.get(ph.name) : undefined;
    let replacement: string;
    if (component) {
      replacement = component.html;
      if (component.css.trim()) cssChunks.push(component.css.trim());
      expanded.push(ph.name);
    } else {
      replacement = `<div class="p-4 border border-dashed border-red-400 text-red-500 text-sm"><!-- 未知元件: ${ph.name || '(未命名)'} -->元件「${ph.name || '(未命名)'}」不存在於元件庫</div>`;
      unknown.push(ph.name || '(未命名)');
    }
    out = out.slice(0, ph.start) + replacement + out.slice(ph.end);
  }

  // Merge component css into the SFC's <style> block (dedupe identical chunks).
  const injectedCss = [...new Set(cssChunks)].join('\n');
  if (injectedCss) {
    const styleClose = out.lastIndexOf('</style>');
    if (styleClose >= 0) {
      out = out.slice(0, styleClose) + '\n' + injectedCss + '\n' + out.slice(styleClose);
    } else {
      out = out + `\n<style>\n${injectedCss}\n</style>`;
    }
  }

  return { payload: out, expanded: expanded.reverse(), unknown: unknown.reverse(), injectedCss };
}

/** Snapshot the current content of a component into component_versions —
 *  called BEFORE an update so refinement history stays queryable. */
export function snapshotComponentVersion(db: Database.Database, componentId: string): void {
  const row = db.prepare('SELECT * FROM components WHERE id = ?').get(componentId) as Record<string, unknown> | undefined;
  if (!row) return;
  db.prepare(
    `INSERT OR IGNORE INTO component_versions (id, component_id, version, html, css, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), componentId, row.version, row.html, (row.css as string) ?? '', new Date().toISOString());
}

export function listComponentVersions(db: Database.Database, componentId: string): Array<{ version: number; html: string; css: string; createdAt: string }> {
  const rows = db.prepare(
    'SELECT version, html, css, created_at FROM component_versions WHERE component_id = ? ORDER BY version DESC',
  ).all(componentId) as Array<Record<string, unknown>>;
  return rows.map(r => ({ version: r.version as number, html: r.html as string, css: (r.css as string) ?? '', createdAt: r.created_at as string }));
}
