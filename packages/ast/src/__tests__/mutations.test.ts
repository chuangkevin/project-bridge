import { describe, it, expect } from 'vitest';
import { addComponent } from '../mutations/addComponent';
import type { SemanticUIAst } from '../types/ast';
import { AST_SCHEMA_VERSION } from '../index';

const baseAst = (): SemanticUIAst => ({
  schemaVersion: AST_SCHEMA_VERSION,
  artifactId: 'home',
  kind: 'page',
  root: {
    id: 'n_root', type: 'Container', props: {},
    layout: { kind: 'stack', direction: 'vertical' },
    style: {}, bindings: [], events: [], constraints: [], children: [],
  },
});

describe('addComponent', () => {
  it('appends a new child to parent and returns a new AST', () => {
    const before = baseAst();
    const { ast: after, newNodeId } = addComponent(before, {
      parentId: 'n_root', type: 'Text', props: { content: 'hello' },
    });
    expect(after).not.toBe(before);
    expect(before.root.children).toHaveLength(0);
    expect(after.root.children).toHaveLength(1);
    expect(after.root.children[0]?.type).toBe('Text');
    expect(after.root.children[0]?.id).toBe(newNodeId);
  });

  it('throws when parent id not found', () => {
    expect(() => addComponent(baseAst(), { parentId: 'n_nope', type: 'Text', props: {} }))
      .toThrow(/parent.*not found/i);
  });

  it('inserts at index when provided', () => {
    let ast = baseAst();
    ast = addComponent(ast, { parentId: 'n_root', type: 'Text', props: { content: 'a' } }).ast;
    ast = addComponent(ast, { parentId: 'n_root', type: 'Text', props: { content: 'b' } }).ast;
    ast = addComponent(ast, { parentId: 'n_root', type: 'Text', props: { content: 'INSERT' }, index: 1 }).ast;
    expect(ast.root.children.map(c => (c.props.content as string))).toEqual(['a', 'INSERT', 'b']);
  });
});

import { setProp } from '../mutations/setProp';

describe('setProp', () => {
  it('sets a prop on the target node, returns new AST', () => {
    let ast = baseAst();
    const added = addComponent(ast, { parentId: 'n_root', type: 'Text', props: { content: 'hi' } });
    const after = setProp(added.ast, { nodeId: added.newNodeId, key: 'content', value: 'goodbye' });
    expect(after).not.toBe(added.ast);
    expect((after.root.children[0]?.props.content)).toBe('goodbye');
    expect((added.ast.root.children[0]?.props.content)).toBe('hi');
  });

  it('throws when node id not found', () => {
    expect(() => setProp(baseAst(), { nodeId: 'n_nope', key: 'x', value: 1 }))
      .toThrow(/node.*not found/i);
  });
});
