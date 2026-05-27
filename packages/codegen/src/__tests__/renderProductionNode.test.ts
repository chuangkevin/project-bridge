import { describe, it, expect } from 'vitest';
import { renderProductionNode } from '../renderProductionNode';
import type { ComponentNode } from '@designbridge/ast';

const node = (id: string, type: string, props = {}, bindings: ComponentNode['bindings'] = [], events: ComponentNode['events'] = []): ComponentNode =>
  ({ id, type, props, layout: { kind: 'flow' }, style: {}, bindings, events, constraints: [], children: [] });

describe('renderProductionNode', () => {
  it('Input with a state binding on value → v-model', () => {
    const out = renderProductionNode(node('n_in', 'Input', { inputType: 'email' }, [{ propKey: 'value', source: 'state', path: 'form.email' }]), 0);
    expect(out).toContain('v-model="state.form.email"');
    expect(out).toContain('type="email"');
  });
  it('Button with a click event → @click handler', () => {
    const out = renderProductionNode(node('n_btn', 'Button', { label: 'Go' }, [], [{ event: 'click', action: { kind: 'navigate', to: '/' } }]), 0);
    expect(out).toContain('@click="on_n_btn_click"');
    expect(out).toContain('>Go</button>');
  });
  it('Text with a state binding on content → interpolation', () => {
    const out = renderProductionNode(node('n_t', 'Text', { content: 'static' }, [{ propKey: 'content', source: 'state', path: 'user.name' }]), 0);
    expect(out).toContain('{{ state.user.name }}');
    expect(out).not.toContain('>static<');
  });
  it('falls back to static (Mock-like) when no bindings/events', () => {
    expect(renderProductionNode(node('n_t', 'Text', { content: 'hello' }), 0)).toContain('>hello</span>');
  });
  it('Form with submit event → @submit.prevent', () => {
    const out = renderProductionNode(node('n_f', 'Form', {}, [], [{ event: 'submit', action: { kind: 'api', endpoint: { method: 'POST', url: '/x' } } }]), 0);
    expect(out).toMatch(/@submit\.prevent="on_n_f_submit"/);
  });
});
