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

import { removeComponent } from '../mutations/removeComponent';
import { moveComponent } from '../mutations/moveComponent';

describe('removeComponent', () => {
  it('removes the target node from its parent', () => {
    let ast = baseAst();
    const added = addComponent(ast, { parentId: 'n_root', type: 'Text', props: { content: 'hi' } });
    const after = removeComponent(added.ast, { nodeId: added.newNodeId });
    expect(after.root.children).toHaveLength(0);
    expect(added.ast.root.children).toHaveLength(1);
  });

  it('refuses to remove the root', () => {
    expect(() => removeComponent(baseAst(), { nodeId: 'n_root' }))
      .toThrow(/cannot remove root/i);
  });

  it('throws when node id not found', () => {
    expect(() => removeComponent(baseAst(), { nodeId: 'n_missing' }))
      .toThrow(/node.*not found/i);
  });
});

describe('moveComponent', () => {
  it('moves a child to a new parent at given index', () => {
    let ast = baseAst();
    const a = addComponent(ast, { parentId: 'n_root', type: 'Container', props: {} });
    const b = addComponent(a.ast, { parentId: 'n_root', type: 'Container', props: {} });
    const t = addComponent(b.ast, { parentId: a.newNodeId, type: 'Text', props: { content: 'x' } });
    const after = moveComponent(t.ast, { nodeId: t.newNodeId, newParentId: b.newNodeId, index: 0 });

    const aNode = after.root.children.find(c => c.id === a.newNodeId);
    const bNode = after.root.children.find(c => c.id === b.newNodeId);
    expect(aNode?.children).toHaveLength(0);
    expect(bNode?.children).toHaveLength(1);
    expect(bNode?.children[0]?.id).toBe(t.newNodeId);
  });

  it('refuses to move a node into its own descendant (would create cycle)', () => {
    let ast = baseAst();
    const parent = addComponent(ast, { parentId: 'n_root', type: 'Container', props: {} });
    const child = addComponent(parent.ast, { parentId: parent.newNodeId, type: 'Container', props: {} });
    expect(() => moveComponent(child.ast, {
      nodeId: parent.newNodeId,
      newParentId: child.newNodeId,
    })).toThrow(/cycle/i);
  });

  it('refuses to move the root', () => {
    expect(() => moveComponent(baseAst(), { nodeId: 'n_root', newParentId: 'n_x' }))
      .toThrow(/cannot move root/i);
  });
});

import { addBinding } from '../mutations/addBinding';
import { addEvent } from '../mutations/addEvent';
import { addConstraintRef } from '../mutations/addConstraintRef';

describe('addBinding', () => {
  it('appends a binding to the target node', () => {
    const added = addComponent(baseAst(), { parentId: 'n_root', type: 'Input', props: {} });
    const after = addBinding(added.ast, {
      nodeId: added.newNodeId,
      binding: { propKey: 'value', source: 'state', path: 'form.email' },
    });
    expect(after.root.children[0]?.bindings).toHaveLength(1);
    expect(after.root.children[0]?.bindings[0]?.path).toBe('form.email');
  });
});

describe('addEvent', () => {
  it('appends an event binding to the target node', () => {
    const added = addComponent(baseAst(), { parentId: 'n_root', type: 'Button', props: { label: 'X' } });
    const after = addEvent(added.ast, {
      nodeId: added.newNodeId,
      event: { event: 'click', action: { kind: 'navigate', to: '/home' } },
    });
    expect(after.root.children[0]?.events).toHaveLength(1);
    expect(after.root.children[0]?.events[0]?.event).toBe('click');
  });
});

describe('addConstraintRef', () => {
  it('appends a rule reference to the target node', () => {
    const added = addComponent(baseAst(), { parentId: 'n_root', type: 'Form', props: {} });
    const after = addConstraintRef(added.ast, {
      nodeId: added.newNodeId,
      ruleId: 'houseprice.form.required-submit',
    });
    expect(after.root.children[0]?.constraints).toEqual([{ ruleId: 'houseprice.form.required-submit' }]);
  });

  it('does not add the same ruleId twice', () => {
    let ast = addComponent(baseAst(), { parentId: 'n_root', type: 'Form', props: {} }).ast;
    const targetId = ast.root.children[0]!.id;
    ast = addConstraintRef(ast, { nodeId: targetId, ruleId: 'r.a' });
    ast = addConstraintRef(ast, { nodeId: targetId, ruleId: 'r.a' });
    expect(ast.root.children[0]?.constraints).toHaveLength(1);
  });
});
