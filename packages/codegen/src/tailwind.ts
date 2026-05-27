import type { LayoutIntent, StyleIntent, ComponentNode } from '@designbridge/ast';
import { sanitizeArbitrary, sanitizeClassToken } from './escape';

const ALIGN: Record<string, string> = { start: 'items-start', center: 'items-center', end: 'items-end', stretch: 'items-stretch' };
const JUSTIFY: Record<string, string> = { start: 'justify-start', center: 'justify-center', end: 'justify-end', between: 'justify-between', around: 'justify-around', evenly: 'justify-evenly' };

function arb(value: number | string | undefined): string | null {
  if (value === undefined) return null;
  if (typeof value === 'number') return `${value}px`;
  return sanitizeArbitrary(value);
}

export function layoutClasses(layout: LayoutIntent): string[] {
  const out: string[] = [];
  switch (layout.kind) {
    case 'stack': {
      out.push('flex', layout.direction === 'vertical' ? 'flex-col' : 'flex-row');
      if (layout.gap !== undefined) out.push(`gap-[${layout.gap}px]`);
      if (layout.align) out.push(ALIGN[layout.align]);
      if (layout.justify) out.push(JUSTIFY[layout.justify]);
      if (layout.wrap) out.push('flex-wrap');
      break;
    }
    case 'grid': {
      out.push('grid');
      out.push(typeof layout.columns === 'number' ? `grid-cols-${layout.columns}` : `grid-cols-[${sanitizeArbitrary(layout.columns) ?? '1'}]`);
      if (layout.gap !== undefined) out.push(`gap-[${layout.gap}px]`);
      break;
    }
    case 'absolute': {
      out.push('absolute');
      if (layout.x !== undefined) out.push(`left-[${layout.x}px]`);
      if (layout.y !== undefined) out.push(`top-[${layout.y}px]`);
      if (layout.width !== undefined) out.push(`w-[${layout.width}px]`);
      if (layout.height !== undefined) out.push(`h-[${layout.height}px]`);
      break;
    }
    case 'flow':
    default:
      break;
  }
  return out.filter(Boolean);
}

export function styleClasses(style: StyleIntent): string[] {
  const out: Array<string | null> = [];
  const push = (prefix: string, value: number | string | undefined) => {
    const a = arb(value);
    out.push(a === null ? null : `${prefix}-[${a}]`);
  };
  if (style.background !== undefined) push('bg', style.background);
  if (style.textColor !== undefined) push('text', style.textColor);
  if (style.padding !== undefined) push('p', style.padding);
  if (style.paddingX !== undefined) push('px', style.paddingX);
  if (style.paddingY !== undefined) push('py', style.paddingY);
  if (style.borderColor !== undefined) push('border', style.borderColor);
  if (style.borderWidth !== undefined) push('border', style.borderWidth);
  if (style.borderRadius !== undefined) push('rounded', style.borderRadius);
  if (style.margin !== undefined) push('m', style.margin);
  if (style.marginX !== undefined) push('mx', style.marginX);
  if (style.marginY !== undefined) push('my', style.marginY);
  if (style.width !== undefined) push('w', style.width);
  if (style.height !== undefined) push('h', style.height);
  if (style.minWidth !== undefined) push('min-w', style.minWidth);
  if (style.maxWidth !== undefined) push('max-w', style.maxWidth);
  if (style.fontSize !== undefined) push('text', style.fontSize);
  if (style.opacity !== undefined) {
    const a = typeof style.opacity === 'number' ? String(style.opacity) : sanitizeArbitrary(style.opacity);
    out.push(a === null ? null : `opacity-[${a}]`);
  }
  if (Array.isArray(style.rawClasses)) {
    for (const c of style.rawClasses) { const s = sanitizeClassToken(c); if (s) out.push(s); }
  }
  return out.filter((c): c is string => typeof c === 'string' && c.length > 0);
}

export function classAttr(node: ComponentNode): string {
  const classes = [...layoutClasses(node.layout), ...styleClasses(node.style)];
  return classes.length ? ` class="${classes.join(' ')}"` : '';
}
