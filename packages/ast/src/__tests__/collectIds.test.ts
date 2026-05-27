import { describe, it, expect } from 'vitest';
import { collectIds, hasDuplicateIds } from '../ids/collectIds';
import type { ComponentNode } from '../types/componentNode';

const leaf = (id: string): ComponentNode => ({
  id, type: 'Text', props: {}, layout: { kind: 'flow' }, style: {},
  bindings: [], events: [], constraints: [], children: [],
});

describe('collectIds', () => {
  it('returns ids for every node in tree (root + descendants)', () => {
    const root: ComponentNode = { ...leaf('n_root'), children: [leaf('n_a'), leaf('n_b')] };
    const ids = collectIds(root);
    expect(ids).toEqual(new Set(['n_root', 'n_a', 'n_b']));
  });
});

describe('hasDuplicateIds', () => {
  it('detects duplicate id in two distinct nodes', () => {
    const root: ComponentNode = { ...leaf('n_root'), children: [leaf('n_dup'), leaf('n_dup')] };
    expect(hasDuplicateIds(root)).toBe(true);
  });
  it('returns false when all ids are unique', () => {
    const root: ComponentNode = { ...leaf('n_root'), children: [leaf('n_a'), leaf('n_b')] };
    expect(hasDuplicateIds(root)).toBe(false);
  });
});
