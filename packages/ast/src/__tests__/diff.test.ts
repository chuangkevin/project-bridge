import { describe, it, expect } from 'vitest';
import { structuralDiff } from '../diff/structuralDiff';
import { addComponent } from '../mutations/addComponent';
import { setProp } from '../mutations/setProp';
import { removeComponent } from '../mutations/removeComponent';
import { AST_SCHEMA_VERSION } from '../index';
import type { SemanticUIAst } from '../types/ast';

const baseAst = (): SemanticUIAst => ({
  schemaVersion: AST_SCHEMA_VERSION, artifactId: 'home', kind: 'page',
  root: { id: 'n_root', type: 'Container', props: {}, layout: { kind: 'stack', direction: 'vertical' },
    style: {}, bindings: [], events: [], constraints: [], children: [] },
});

describe('structuralDiff', () => {
  it('reports addition', () => {
    const before = baseAst();
    const { ast: after, newNodeId } = addComponent(before, { parentId: 'n_root', type: 'Text', props: { content: 'hi' } });
    const diff = structuralDiff(before, after);
    expect(diff.added).toContain(newNodeId);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it('reports removal', () => {
    const a = addComponent(baseAst(), { parentId: 'n_root', type: 'Text', props: { content: 'x' } });
    const after = removeComponent(a.ast, { nodeId: a.newNodeId });
    const diff = structuralDiff(a.ast, after);
    expect(diff.removed).toContain(a.newNodeId);
    expect(diff.added).toEqual([]);
  });

  it('reports prop change as "changed"', () => {
    const a = addComponent(baseAst(), { parentId: 'n_root', type: 'Text', props: { content: 'hi' } });
    const after = setProp(a.ast, { nodeId: a.newNodeId, key: 'content', value: 'bye' });
    const diff = structuralDiff(a.ast, after);
    expect(diff.changed).toContain(a.newNodeId);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it('returns empty diff for identical ASTs', () => {
    const a = baseAst();
    expect(structuralDiff(a, a)).toEqual({ added: [], removed: [], changed: [] });
  });
});
