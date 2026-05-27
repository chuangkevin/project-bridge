import { describe, it, expect, vi } from 'vitest';
import { applyMutation } from '../applyMutation';
import { AST_SCHEMA_VERSION, type SemanticUIAst } from '@designbridge/ast';

const baseAst = (): SemanticUIAst => ({
  schemaVersion: AST_SCHEMA_VERSION, artifactId: 'login', kind: 'page',
  root: { id: 'n_root', type: 'Form', props: {}, layout: { kind: 'stack', direction: 'vertical' },
    style: {}, bindings: [], events: [], constraints: [],
    children: [
      { id: 'n_submit', type: 'Button', props: { label: 'Go' }, layout: { kind: 'flow' }, style: {},
        bindings: [], events: [], constraints: [], children: [] },
    ] },
});

describe('applyMutation', () => {
  it('applies AI-emitted ops and returns a validated result', async () => {
    const ops = JSON.stringify({ ops: [
      { op: 'setProp', nodeId: 'n_submit', key: 'label', value: 'Sign in' },
      { op: 'addComponent', parentId: 'n_root', type: 'Input', props: { inputType: 'email' } },
    ] });
    const generate = vi.fn().mockResolvedValue(ops);
    const after = await applyMutation(baseAst(), 'rename the button to Sign in and add an email field', { generate });
    expect(after.root.children.find(c => c.id === 'n_submit')?.props.label).toBe('Sign in');
    expect(after.root.children.some(c => c.type === 'Input')).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('includes the current AST + ops vocabulary + the instruction in the prompt', async () => {
    const generate = vi.fn().mockResolvedValue('{"ops":[]}');
    await applyMutation(baseAst(), 'make the button red', { generate });
    const call = generate.mock.calls[0][0];
    expect(call.prompt).toMatch(/make the button red/);
    expect(call.prompt).toMatch(/n_submit/);
    expect(call.systemInstruction).toMatch(/setProp|addComponent/);
  });

  it('repairs when the AI emits ops that produce an invalid AST', async () => {
    const bad = JSON.stringify({ ops: [{ op: 'setProp', nodeId: 'n_missing', key: 'x', value: 1 }] });
    const good = JSON.stringify({ ops: [{ op: 'setProp', nodeId: 'n_submit', key: 'label', value: 'Ok' }] });
    const generate = vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce(good);
    const after = await applyMutation(baseAst(), 'fix it', { generate });
    expect(after.root.children[0]?.props.label).toBe('Ok');
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('returns the AST unchanged on an empty op list', async () => {
    const generate = vi.fn().mockResolvedValue('{"ops":[]}');
    const after = await applyMutation(baseAst(), 'no change needed', { generate });
    expect(after.root.children[0]?.props.label).toBe('Go');
  });
});
