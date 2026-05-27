import { describe, it, expect } from 'vitest';
import type { LayoutIntent } from '../types/layoutIntent';

describe('LayoutIntent', () => {
  it('accepts a vertical stack with gap', () => {
    const layout: LayoutIntent = {
      kind: 'stack', direction: 'vertical', gap: 8, align: 'start', justify: 'start',
    };
    expect(layout.kind).toBe('stack');
  });
  it('accepts a grid with column template', () => {
    const layout: LayoutIntent = { kind: 'grid', columns: 3, gap: 16 };
    expect(layout.kind).toBe('grid');
  });
  it('accepts flow layout with no positional hints', () => {
    const layout: LayoutIntent = { kind: 'flow' };
    expect(layout.kind).toBe('flow');
  });
});

import type { StyleIntent } from '../types/styleIntent';

describe('StyleIntent', () => {
  it('accepts background + text + spacing tokens', () => {
    const style: StyleIntent = { background: 'surface-elevated', textColor: 'text-primary', padding: 16, borderRadius: 8 };
    expect(style.background).toBe('surface-elevated');
  });
  it('accepts raw color values (hex / rgb)', () => {
    const style: StyleIntent = { background: '#1e293b', textColor: 'rgb(241,245,249)' };
    expect(style.textColor).toMatch(/rgb/);
  });
  it('accepts empty object (style is optional in spirit)', () => {
    const style: StyleIntent = {};
    expect(Object.keys(style)).toHaveLength(0);
  });
});
