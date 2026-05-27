import { describe, it, expect, vi } from 'vitest';
import { compileFromInput, compileMutation } from '../compile';
import { AST_SCHEMA_VERSION, type SemanticUIAst } from '@designbridge/ast';

const validAstJson = JSON.stringify({
  schemaVersion: 1, artifactId: 'login', kind: 'page',
  root: {
    id: 'n_root', type: 'Form', props: {}, layout: { kind: 'stack', direction: 'vertical' },
    style: {}, bindings: [], events: [], constraints: [],
    children: [
      { id: 'n_btn', type: 'Button', props: { label: 'Sign in' }, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] },
    ],
  },
});

describe('compileFromInput', () => {
  it('runs input → AST → skill check → Vue, returning all three', async () => {
    const generate = vi.fn().mockResolvedValue(validAstJson);
    const result = await compileFromInput({ kind: 'requirement', text: 'a login form' }, { artifactId: 'login', generate });
    expect(result.ast.root.type).toBe('Form');
    expect(result.violations).toEqual([]);
    expect(result.vue.filename).toBe('Login.vue');
    expect(result.vue.code).toContain('<form');
    expect(result.vue.code).toContain('<button type="button">Sign in</button>');
  });

  it('reports skill violations (Form without Button) but still returns AST + Vue', async () => {
    const buttonless = JSON.stringify({
      schemaVersion: 1, artifactId: 'x', kind: 'page',
      root: { id: 'n_root', type: 'Form', props: {}, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] },
    });
    const generate = vi.fn().mockResolvedValue(buttonless);
    const result = await compileFromInput({ kind: 'requirement', text: 'empty form' }, { artifactId: 'x', generate });
    expect(result.violations.some(v => v.ruleId === 'core.form.requires-button' && v.severity === 'error')).toBe(true);
    expect(result.vue.code).toContain('<form');
  });
});

describe('compileMutation', () => {
  it('applies an NL edit via AI ops, re-checks rules, re-renders', async () => {
    const ast: SemanticUIAst = {
      schemaVersion: AST_SCHEMA_VERSION, artifactId: 'login', kind: 'page',
      root: { id: 'n_root', type: 'Form', props: {}, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [],
        children: [ { id: 'n_btn', type: 'Button', props: { label: 'Go' }, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] } ] },
    };
    const ops = JSON.stringify({ ops: [{ op: 'setProp', nodeId: 'n_btn', key: 'label', value: 'Submit' }] });
    const generate = vi.fn().mockResolvedValue(ops);
    const result = await compileMutation(ast, 'rename button to Submit', { generate });
    expect(result.ast.root.children[0]?.props.label).toBe('Submit');
    expect(result.vue.code).toContain('<button type="button">Submit</button>');
    expect(result.violations).toEqual([]);
  });
});
