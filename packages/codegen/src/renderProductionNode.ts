import type { ComponentNode } from '@designbridge/ast';
import { escapeHtml, escapeAttr } from './escape';
import { classAttr } from './tailwind';

const pad = (depth: number): string => '  '.repeat(Math.max(depth, 0));
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : fallback);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const ident = (s: string): string => s.replace(/[^A-Za-z0-9_]/g, '_');

/** Vue handler attr name per event (mount/unmount have no DOM directive → skipped). */
const EVENT_DIRECTIVE: Record<string, string> = {
  click: '@click',
  change: '@change',
  input: '@input',
  focus: '@focus',
  blur: '@blur',
  submit: '@submit.prevent',
};

/** Map a node's events to ` @click="on_..."`-style directive attrs (leading space each, joined). */
function eventsAttr(node: ComponentNode): string {
  return node.events
    .map((e) => {
      const directive = EVENT_DIRECTIVE[e.event];
      if (!directive) return '';
      return ` ${directive}="on_${ident(node.id)}_${ident(e.event)}"`;
    })
    .join('');
}

/** Return the state path bound to a given prop, or null when not state-bound. */
function stateBinding(node: ComponentNode, propKey: string): string | null {
  const b = node.bindings.find((bind) => bind.source === 'state' && bind.propKey === propKey && typeof bind.path === 'string' && bind.path);
  return b ? (b.path as string) : null;
}

function renderChildren(node: ComponentNode, depth: number): string {
  if (node.children.length === 0) return '';
  const inner = node.children.map((c) => renderProductionNode(c, depth + 1)).join('\n');
  return `\n${inner}\n${pad(depth)}`;
}

/** Render a single AST node (and subtree) to indented Vue-template HTML WITH Vue directives. */
export function renderProductionNode(node: ComponentNode, depth: number): string {
  const indent = pad(depth);
  const cls = classAttr(node);
  const ev = eventsAttr(node);
  const p = node.props;

  switch (node.type) {
    case 'Container':
    case 'Stack':
    case 'Row':
    case 'Grid':
      return `${indent}<div${cls}${ev}>${renderChildren(node, depth)}</div>`;
    case 'Form':
      return `${indent}<form${cls}${ev}>${renderChildren(node, depth)}</form>`;
    case 'Card':
      return `${indent}<div${cls}${ev}>${p.title !== undefined ? `\n${pad(depth + 1)}<h3>${escapeHtml(str(p.title))}</h3>` : ''}${renderChildren(node, depth)}</div>`;
    case 'Modal':
      return `${indent}<div${cls}${ev} role="dialog" aria-modal="true">${p.title !== undefined ? `\n${pad(depth + 1)}<h2>${escapeHtml(str(p.title))}</h2>` : ''}${renderChildren(node, depth)}</div>`;
    case 'FormField':
      return `${indent}<div${cls}${ev}>${p.label !== undefined ? `\n${pad(depth + 1)}<label>${escapeHtml(str(p.label))}</label>` : ''}${renderChildren(node, depth)}</div>`;

    case 'Text': {
      const path = stateBinding(node, 'content');
      const content = path ? `{{ state.${path} }}` : escapeHtml(str(p.content));
      return `${indent}<span${cls}${ev}>${content}</span>`;
    }
    case 'Heading': {
      const raw = str(p.level);
      const level = ['1', '2', '3', '4', '5', '6'].includes(raw) ? raw : '2';
      const path = stateBinding(node, 'content');
      const content = path ? `{{ state.${path} }}` : escapeHtml(str(p.content));
      return `${indent}<h${level}${cls}${ev}>${content}</h${level}>`;
    }
    case 'Image': {
      const srcPath = stateBinding(node, 'src');
      const altPath = stateBinding(node, 'alt');
      const srcAttr = srcPath ? `:src="state.${srcPath}"` : `src="${escapeAttr(str(p.src))}"`;
      const altAttr = altPath ? `:alt="state.${altPath}"` : `alt="${escapeAttr(str(p.alt))}"`;
      return `${indent}<img${cls}${ev} ${srcAttr} ${altAttr} />`;
    }
    case 'Icon':
      return `${indent}<span${cls}${ev} aria-hidden="true" data-icon="${escapeAttr(str(p.name))}"></span>`;

    case 'Button': {
      const path = stateBinding(node, 'label');
      const label = path ? `{{ state.${path} }}` : escapeHtml(str(p.label));
      return `${indent}<button${cls}${ev} type="button">${label}</button>`;
    }
    case 'Link': {
      const labelPath = stateBinding(node, 'label');
      const label = labelPath ? `{{ state.${labelPath} }}` : escapeHtml(str(p.label));
      const hrefPath = stateBinding(node, 'href');
      const hrefAttr = hrefPath ? `:href="state.${hrefPath}"` : `href="${escapeAttr(str(p.href, '#'))}"`;
      return `${indent}<a${cls}${ev} ${hrefAttr}>${label}</a>`;
    }

    case 'Input': {
      const path = stateBinding(node, 'value');
      const vmodel = path ? ` v-model="state.${path}"` : '';
      return `${indent}<input${cls}${ev}${vmodel} type="${escapeAttr(str(p.inputType, 'text'))}" placeholder="${escapeAttr(str(p.placeholder))}" />`;
    }
    case 'Textarea': {
      const path = stateBinding(node, 'value');
      const vmodel = path ? ` v-model="state.${path}"` : '';
      return `${indent}<textarea${cls}${ev}${vmodel} placeholder="${escapeAttr(str(p.placeholder))}"${p.rows !== undefined ? ` rows="${escapeAttr(str(p.rows))}"` : ''}></textarea>`;
    }
    case 'Select': {
      const path = stateBinding(node, 'value');
      const vmodel = path ? ` v-model="state.${path}"` : '';
      return `${indent}<select${cls}${ev}${vmodel}>${arr(p.options).map((o) => `\n${pad(depth + 1)}<option>${escapeHtml(str(o))}</option>`).join('')}\n${indent}</select>`;
    }
    case 'Checkbox': {
      const path = stateBinding(node, 'checked') ?? stateBinding(node, 'value');
      const vmodel = path ? ` v-model="state.${path}"` : '';
      return `${indent}<label${cls}${ev}><input type="checkbox"${vmodel} /> ${escapeHtml(str(p.label))}</label>`;
    }
    case 'Radio': {
      const path = stateBinding(node, 'value');
      const vmodel = path ? ` v-model="state.${path}"` : '';
      return `${indent}<div${cls}${ev}>${arr(p.options).map((o) => `\n${pad(depth + 1)}<label><input type="radio"${vmodel} /> ${escapeHtml(str(o))}</label>`).join('')}\n${indent}</div>`;
    }

    case 'Table': {
      const cols = arr(p.columns).map((c) => `<th>${escapeHtml(str(c))}</th>`).join('');
      const rows = arr(p.rows)
        .map((row) => `\n${pad(depth + 1)}<tr>${arr(row).map((cell) => `<td>${escapeHtml(str(cell))}</td>`).join('')}</tr>`)
        .join('');
      return `${indent}<table${cls}${ev}>\n${pad(depth + 1)}<thead><tr>${cols}</tr></thead>\n${pad(depth + 1)}<tbody>${rows}\n${pad(depth + 1)}</tbody>\n${indent}</table>`;
    }

    default:
      return `${indent}<div${cls}${ev} data-unknown-type="${escapeAttr(node.type)}">${renderChildren(node, depth)}</div>`;
  }
}
