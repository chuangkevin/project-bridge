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
