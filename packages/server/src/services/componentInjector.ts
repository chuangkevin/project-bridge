import db from '../db/connection';

export interface InjectedComponent {
  id: string;
  name: string;
  category: string;
  html: string;
  css: string;
}

/**
 * Map page element type keywords to component categories.
 */
const CATEGORY_MAP: Record<string, string> = {
  navigation: 'navigation',
  nav: 'navigation',
  sidebar: 'navigation',
  menu: 'navigation',
  breadcrumb: 'navigation',
  card: 'card',
  'card-list': 'card',
  listing: 'card',
  grid: 'card',
  tile: 'card',
  form: 'form',
  search: 'form',
  filter: 'form',
  input: 'form',
  button: 'button',
  cta: 'button',
  action: 'button',
  hero: 'hero',
  banner: 'hero',
  splash: 'hero',
  footer: 'footer',
  'bottom-bar': 'footer',
  modal: 'modal',
  dialog: 'modal',
  popup: 'modal',
  table: 'table',
  'data-grid': 'table',
  'data-list': 'table',
};

const MAX_CHARS = 16000;

/**
 * Get components bound to a project, optionally filtered by page element types.
 * Returns formatted prompt text with component references for AI injection.
 * Returns empty string if no components are bound.
 */
export function getComponentInjection(projectId: string, pageElementTypes?: string[]): string {
  // Query bound components for this project
  const rows = db.prepare(`
    SELECT c.id, c.name, c.category, c.html, c.css, c.updated_at
    FROM components c
    JOIN project_component_bindings pcb ON pcb.component_id = c.id
    WHERE pcb.project_id = ?
    ORDER BY c.updated_at DESC
  `).all(projectId) as (InjectedComponent & { updated_at: string })[];

  if (rows.length === 0) return '';

  // Resolve target categories from page element types
  let targetCategories: Set<string> | null = null;
  if (pageElementTypes && pageElementTypes.length > 0) {
    targetCategories = new Set<string>();
    for (const el of pageElementTypes) {
      const normalized = el.toLowerCase().trim();
      const mapped = CATEGORY_MAP[normalized];
      if (mapped) {
        targetCategories.add(mapped);
      }
    }
    // If no mappings found, don't filter — return all
    if (targetCategories.size === 0) targetCategories = null;
  }

  // Sort: exact category match first, then by updated_at desc, then smallest HTML
  let sorted: typeof rows;
  if (targetCategories) {
    const matched = rows.filter(r => targetCategories!.has(r.category));
    const unmatched = rows.filter(r => !targetCategories!.has(r.category));
    // Within each group, already sorted by updated_at DESC from SQL
    // Secondary sort by HTML size (smaller first) for budget efficiency
    const bySize = (a: typeof rows[0], b: typeof rows[0]) => a.html.length - b.html.length;
    matched.sort(bySize);
    unmatched.sort(bySize);
    sorted = [...matched, ...unmatched];
  } else {
    sorted = rows;
  }

  // Build output respecting token budget
  const header = '[元件庫參考 — 請優先使用以下已驗證的元件結構，保持風格一致]\n\n';
  let output = header;
  let truncated = false;

  for (const comp of sorted) {
    const block = `[component: ${comp.name} (category: ${comp.category})]\n${comp.html}\n<style>${comp.css}</style>\n[/component]\n\n`;

    if (output.length + block.length > MAX_CHARS) {
      truncated = true;
      break;
    }
    output += block;
  }

  // If we only have the header (no components fit), return empty
  if (output === header) return '';

  if (truncated) {
    output += '[更多元件已省略]\n';
  }

  return output;
}

/**
 * Get the list of components bound to a project (for post-processing reference tagging).
 */
export function getBoundComponents(projectId: string): InjectedComponent[] {
  return db.prepare(`
    SELECT c.id, c.name, c.category, c.html, c.css
    FROM components c
    JOIN project_component_bindings pcb ON pcb.component_id = c.id
    WHERE pcb.project_id = ?
  `).all(projectId) as InjectedComponent[];
}
