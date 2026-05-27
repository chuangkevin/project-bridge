import type { ComponentNode } from '@designbridge/ast';
import { escapeHtml, escapeAttr } from './escape';
import { classAttr } from './tailwind';

const pad = (depth: number): string => '  '.repeat(Math.max(depth, 0));
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : fallback);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function renderChildren(node: ComponentNode, depth: number): string {
  if (node.children.length === 0) return '';
  const inner = node.children.map((c) => renderNode(c, depth + 1)).join('\n');
  return `\n${inner}\n${pad(depth)}`;
}

/** Render a single AST node (and subtree) to indented Vue-template HTML. Mock = visual only. */
export function renderNode(node: ComponentNode, depth: number): string {
  const indent = pad(depth);
  const cls = classAttr(node);
  const p = node.props;

  switch (node.type) {
    case 'Container':
    case 'Stack':
    case 'Row':
    case 'Grid':
      return `${indent}<div${cls}>${renderChildren(node, depth)}</div>`;
    case 'Form':
      return `${indent}<form${cls}>${renderChildren(node, depth)}</form>`;
    case 'Card':
      return `${indent}<div${cls}>${p.title !== undefined ? `\n${pad(depth + 1)}<h3>${escapeHtml(str(p.title))}</h3>` : ''}${renderChildren(node, depth)}</div>`;
    case 'Modal':
      return `${indent}<div${cls} role="dialog" aria-modal="true">${p.title !== undefined ? `\n${pad(depth + 1)}<h2>${escapeHtml(str(p.title))}</h2>` : ''}${renderChildren(node, depth)}</div>`;
    case 'FormField':
      return `${indent}<div${cls}>${p.label !== undefined ? `\n${pad(depth + 1)}<label>${escapeHtml(str(p.label))}</label>` : ''}${renderChildren(node, depth)}</div>`;

    case 'Text':
      return `${indent}<span${cls}>${escapeHtml(str(p.content))}</span>`;
    case 'Heading': {
      const level = ['1', '2', '3', '4', '5', '6'].includes(str(p.level)) ? str(p.level) : '2';
      return `${indent}<h${level}${cls}>${escapeHtml(str(p.content))}</h${level}>`;
    }
    case 'Image':
      return `${indent}<img${cls} src="${escapeAttr(str(p.src))}" alt="${escapeAttr(str(p.alt))}" />`;
    case 'Icon':
      return `${indent}<span${cls} aria-hidden="true" data-icon="${escapeAttr(str(p.name))}"></span>`;

    case 'Button':
      return `${indent}<button${cls} type="button">${escapeAttr(str(p.label))}</button>`;
    case 'Link':
      return `${indent}<a${cls} href="${escapeAttr(str(p.href, '#'))}">${escapeHtml(str(p.label))}</a>`;

    case 'Input':
      return `${indent}<input${cls} type="${escapeAttr(str(p.inputType, 'text'))}" placeholder="${escapeAttr(str(p.placeholder))}" />`;
    case 'Textarea':
      return `${indent}<textarea${cls} placeholder="${escapeAttr(str(p.placeholder))}"${p.rows !== undefined ? ` rows="${escapeAttr(str(p.rows))}"` : ''}></textarea>`;
    case 'Select':
      return `${indent}<select${cls}>${arr(p.options).map((o) => `\n${pad(depth + 1)}<option>${escapeHtml(str(o))}</option>`).join('')}\n${indent}</select>`;
    case 'Checkbox':
      return `${indent}<label${cls}><input type="checkbox" /> ${escapeHtml(str(p.label))}</label>`;
    case 'Radio':
      return `${indent}<div${cls}>${arr(p.options).map((o) => `\n${pad(depth + 1)}<label><input type="radio" /> ${escapeHtml(str(o))}</label>`).join('')}\n${indent}</div>`;

    case 'Table': {
      const cols = arr(p.columns).map((c) => `<th>${escapeHtml(str(c))}</th>`).join('');
      const rows = arr(p.rows)
        .map((row) => `\n${pad(depth + 1)}<tr>${arr(row).map((cell) => `<td>${escapeHtml(str(cell))}</td>`).join('')}</tr>`)
        .join('');
      return `${indent}<table${cls}>\n${pad(depth + 1)}<thead><tr>${cols}</tr></thead>\n${pad(depth + 1)}<tbody>${rows}\n${pad(depth + 1)}</tbody>\n${indent}</table>`;
    }

    default:
      return `${indent}<div${cls} data-unknown-type="${escapeAttr(node.type)}">${renderChildren(node, depth)}</div>`;
  }
}
