import { describe, it, expect } from 'vitest';
import { applyMutationOps } from '../mutations/mutationOp';
import type { MutationOp } from '../mutations/mutationOp';
import { AST_SCHEMA_VERSION } from '../index';
import type { SemanticUIAst } from '../types/ast';

const baseAst = (): SemanticUIAst => ({
  schemaVersion: AST_SCHEMA_VERSION, artifactId: 'home', kind: 'page',
  root: { id: 'n_root', type: 'Container', props: {}, layout: { kind: 'stack', direction: 'vertical' },
    style: {}, bindings: [], events: [], constraints: [], children: [] },
});

describe('applyMutationOps', () => {
  it('applies a sequence of ops immutably, returning a new AST', () => {
    const before = baseAst();
    const ops: MutationOp[] = [
      { op: 'addComponent', parentId: 'n_root', type: 'Text', props: { content: 'hi' } },
      { op: 'addComponent', parentId: 'n_root', type: 'Button', props: { label: 'Go' } },
    ];
    const after = applyMutationOps(before, ops);
    expect(after).not.toBe(before);
    expect(before.root.children).toHaveLength(0);
    expect(after.root.children.map(c => c.type)).toEqual(['Text', 'Button']);
  });

  it('applies setProp / removeComponent / moveComponent / addBinding / addEvent / addConstraintRef', () => {
    let ast = baseAst();
    ast = applyMutationOps(ast, [{ op: 'addComponent', parentId: 'n_root', type: 'Container', props: {} }]);
    const containerId = ast.root.children[0]!.id;
    ast = applyMutationOps(ast, [{ op: 'addComponent', parentId: containerId, type: 'Input', props: { placeholder: 'x' } }]);
    const inputId = ast.root.children[0]!.children[0]!.id;

    ast = applyMutationOps(ast, [
      { op: 'setProp', nodeId: inputId, key: 'placeholder', value: 'email' },
      { op: 'addBinding', nodeId: inputId, binding: { propKey: 'value', source: 'state', path: 'form.email' } },
      { op: 'addEvent', nodeId: inputId, event: { event: 'change', action: { kind: 'setState', path: 'form.email', valueFromEvent: true } } },
      { op: 'addConstraintRef', nodeId: inputId, ruleId: 'r.required' },
    ]);
    const input = ast.root.children[0]!.children[0]!;
    expect(input.props.placeholder).toBe('email');
    expect(input.bindings).toHaveLength(1);
    expect(input.events).toHaveLength(1);
    expect(input.constraints).toEqual([{ ruleId: 'r.required' }]);

    ast = applyMutationOps(ast, [{ op: 'moveComponent', nodeId: inputId, newParentId: 'n_root' }]);
    expect(ast.root.children.some(c => c.id === inputId)).toBe(true);
    ast = applyMutationOps(ast, [{ op: 'removeComponent', nodeId: inputId }]);
    expect(ast.root.children.some(c => c.id === inputId)).toBe(false);
  });

  it('throws (propagating the primitive error) on an op targeting a missing node, with op index context', () => {
    expect(() => applyMutationOps(baseAst(), [{ op: 'setProp', nodeId: 'n_missing', key: 'x', value: 1 }]))
      .toThrow(/op\[0\].*not found/i);
  });

  it('throws on an unknown op kind', () => {
    expect(() => applyMutationOps(baseAst(), [{ op: 'frobnicate' } as unknown as MutationOp]))
      .toThrow(/unknown mutation op/i);
  });
});
