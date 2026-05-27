import { describe, it, expect } from 'vitest';
import { collectApiLoaders, buildScriptSetup } from '../productionScript';
import type { ComponentNode } from '@designbridge/ast';

const n = (id: string, type: string, bindings: ComponentNode['bindings'] = [], events: ComponentNode['events'] = [], children: ComponentNode[] = []): ComponentNode =>
  ({ id, type, props: {}, layout: { kind: 'flow' }, style: {}, bindings, events, constraints: [], children });

describe('collectApiLoaders', () => {
  it('finds api-source bindings', () => {
    const root = n('n_root', 'Container', [], [], [
      n('n_tbl', 'Table', [{ propKey: 'rows', source: 'api', endpoint: { method: 'GET', url: '/api/users' } }]),
    ]);
    const loaders = collectApiLoaders(root);
    expect(loaders).toHaveLength(1);
    expect(loaders[0]).toMatchObject({ nodeId: 'n_tbl', propKey: 'rows', method: 'GET', url: '/api/users' });
  });
});

describe('buildScriptSetup', () => {
  it('emits <script setup> with vue imports, reactive state, api loader stub, and event handlers', () => {
    const root = n('n_root', 'Form', [], [], [
      n('n_in', 'Input', [{ propKey: 'value', source: 'state', path: 'form.email' }],
        [{ event: 'change', action: { kind: 'setState', path: 'form.email', valueFromEvent: true } }]),
      n('n_btn', 'Button', [], [{ event: 'click', action: { kind: 'api', endpoint: { method: 'POST', url: '/api/login' }, payloadFromState: 'form' } }]),
      n('n_tbl', 'Table', [{ propKey: 'rows', source: 'api', endpoint: { method: 'GET', url: '/api/users' } }]),
    ]);
    const script = buildScriptSetup(root);
    expect(script).toMatch(/^<script setup>/);
    expect(script).toMatch(/import \{ reactive, ref.*\} from 'vue'/);
    expect(script).toContain("const state = reactive(");
    expect(script).toContain('form');
    expect(script).toMatch(/function on_n_btn_click\(/);
    expect(script).toMatch(/\/api\/login/);
    expect(script).toMatch(/n_tbl.*ref\(|rows.*ref\(/);
    expect(script).toContain('</script>');
  });
  it('returns a minimal script when there is no state/events/api', () => {
    const root = n('n_root', 'Container');
    expect(buildScriptSetup(root)).toMatch(/<script setup>[\s\S]*<\/script>/);
  });
});
