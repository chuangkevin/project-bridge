import { describe, it, expect } from 'vitest';
import { renderVueProduction } from '../renderVueProduction';
import { AST_SCHEMA_VERSION, type SemanticUIAst } from '@designbridge/ast';

const ast: SemanticUIAst = {
  schemaVersion: AST_SCHEMA_VERSION, artifactId: 'login', kind: 'page',
  root: {
    id: 'n_root', type: 'Form', props: {}, layout: { kind: 'stack', direction: 'vertical', gap: 12 }, style: { padding: 24 },
    bindings: [], events: [{ event: 'submit', action: { kind: 'api', endpoint: { method: 'POST', url: '/api/login' }, payloadFromState: 'form' } }], constraints: [],
    children: [
      { id: 'n_email', type: 'Input', props: { inputType: 'email' }, layout: { kind: 'flow' }, style: {},
        bindings: [{ propKey: 'value', source: 'state', path: 'form.email' }], events: [], constraints: [], children: [] },
      { id: 'n_btn', type: 'Button', props: { label: 'Sign in' }, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] },
    ],
  },
};

describe('renderVueProduction', () => {
  const out = renderVueProduction(ast);
  it('returns filename + code', () => { expect(out.filename).toBe('Login.vue'); });
  it('has BOTH <script setup> and <template> (unlike Mock)', () => {
    expect(out.code).toContain('<script setup>');
    expect(out.code).toContain('<template>');
    expect(out.code).toContain('const state = reactive(');
  });
  it('wires v-model on the bound input + @submit on the form', () => {
    expect(out.code).toContain('v-model="state.form.email"');
    expect(out.code).toMatch(/@submit(\.prevent)?="on_n_root_submit"/);
  });
  it('contains the api stub for the submit handler', () => {
    expect(out.code).toMatch(/\/api\/login/);
  });
});
