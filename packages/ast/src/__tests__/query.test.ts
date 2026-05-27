import { describe, it, expect } from 'vitest';
import { findNode } from '../query/findNode';
import { getAncestors } from '../query/getAncestors';
import { getDescendants } from '../query/getDescendants';
import { addComponent } from '../mutations/addComponent';
import { AST_SCHEMA_VERSION } from '../index';
import type { SemanticUIAst } from '../types/ast';

const baseAst = (): SemanticUIAst => ({
  schemaVersion: AST_SCHEMA_VERSION,
  artifactId: 'home', kind: 'page',
  root: { id: 'n_root', type: 'Container', props: {}, layout: { kind: 'stack', direction: 'vertical' },
    style: {}, bindings: [], events: [], constraints: [], children: [] },
});

describe('findNode', () => {
  it('finds root', () => {
    expect(findNode(baseAst(), 'n_root')?.type).toBe('Container');
  });
  it('finds nested', () => {
    const a = addComponent(baseAst(), { parentId: 'n_root', type: 'Container', props: {} });
    const b = addComponent(a.ast, { parentId: a.newNodeId, type: 'Text', props: { content: 'hi' } });
    expect(findNode(b.ast, b.newNodeId)?.type).toBe('Text');
  });
  it('returns undefined for missing', () => {
    expect(findNode(baseAst(), 'n_nope')).toBeUndefined();
  });
});

describe('getAncestors', () => {
  it('returns chain from immediate parent up to root', () => {
    const a = addComponent(baseAst(), { parentId: 'n_root', type: 'Container', props: {} });
    const b = addComponent(a.ast, { parentId: a.newNodeId, type: 'Container', props: {} });
    const c = addComponent(b.ast, { parentId: b.newNodeId, type: 'Text', props: { content: 'x' } });
    const ancestors = getAncestors(c.ast, c.newNodeId);
    expect(ancestors.map(n => n.id)).toEqual([b.newNodeId, a.newNodeId, 'n_root']);
  });
  it('returns empty array for root', () => {
    expect(getAncestors(baseAst(), 'n_root')).toEqual([]);
  });
  it('returns empty array for missing node', () => {
    expect(getAncestors(baseAst(), 'n_nope')).toEqual([]);
  });
});

describe('getDescendants', () => {
  it('returns all descendant ids (excluding self)', () => {
    const a = addComponent(baseAst(), { parentId: 'n_root', type: 'Container', props: {} });
    const b = addComponent(a.ast, { parentId: a.newNodeId, type: 'Text', props: { content: 'x' } });
    const ids = getDescendants(b.ast, 'n_root').map(n => n.id);
    expect(new Set(ids)).toEqual(new Set([a.newNodeId, b.newNodeId]));
  });
});
