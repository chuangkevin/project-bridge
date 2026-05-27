import { describe, it, expect } from 'vitest';
import { layoutClasses, styleClasses, classAttr } from '../tailwind';
import type { ComponentNode } from '@designbridge/ast';

describe('layoutClasses', () => {
  it('stack vertical with gap/align/justify', () => {
    expect(layoutClasses({ kind: 'stack', direction: 'vertical', gap: 8, align: 'center', justify: 'between' }))
      .toEqual(['flex', 'flex-col', 'gap-[8px]', 'items-center', 'justify-between']);
  });
  it('stack horizontal', () => { expect(layoutClasses({ kind: 'stack', direction: 'horizontal' })).toEqual(['flex', 'flex-row']); });
  it('grid with numeric columns', () => { expect(layoutClasses({ kind: 'grid', columns: 3, gap: 16 })).toEqual(['grid', 'grid-cols-3', 'gap-[16px]']); });
  it('grid with template-string columns uses arbitrary value', () => { expect(layoutClasses({ kind: 'grid', columns: '1fr 2fr' })).toEqual(['grid', 'grid-cols-[1fr_2fr]']); });
  it('flow yields no classes', () => { expect(layoutClasses({ kind: 'flow' })).toEqual([]); });
});
describe('styleClasses', () => {
  it('maps background/textColor/padding/borderRadius to arbitrary values', () => {
    expect(styleClasses({ background: '#1e293b', textColor: '#f1f5f9', padding: 16, borderRadius: 8 }))
      .toEqual(['bg-[#1e293b]', 'text-[#f1f5f9]', 'p-[16px]', 'rounded-[8px]']);
  });
  it('supports paddingX/paddingY', () => { expect(styleClasses({ paddingX: 12, paddingY: 4 })).toEqual(['px-[12px]', 'py-[4px]']); });
  it('omits a class when the value cannot be sanitized', () => { expect(styleClasses({ background: 'evil]value' })).toEqual([]); });
  it('returns [] for empty style', () => { expect(styleClasses({})).toEqual([]); });
});
describe('classAttr', () => {
  const node = (layout: ComponentNode['layout'], style: ComponentNode['style']): ComponentNode => ({
    id: 'n', type: 'Container', props: {}, layout, style, bindings: [], events: [], constraints: [], children: [],
  });
  it('joins layout + style into a class attribute', () => {
    expect(classAttr(node({ kind: 'stack', direction: 'vertical' }, { padding: 8 }))).toBe(' class="flex flex-col p-[8px]"');
  });
  it('returns empty string when there are no classes', () => { expect(classAttr(node({ kind: 'flow' }, {}))).toBe(''); });
});
