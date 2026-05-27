import { describe, it, expect } from 'vitest';
import { collectStatePaths, buildStateInit } from '../productionState';
import type { ComponentNode } from '@designbridge/ast';

const n = (type: string, props = {}, bindings: ComponentNode['bindings'] = [], events: ComponentNode['events'] = [], children: ComponentNode[] = []): ComponentNode =>
  ({ id: 'n', type, props, layout: { kind: 'flow' }, style: {}, bindings, events, constraints: [], children });

describe('collectStatePaths', () => {
  it('collects state-source binding paths + setState event paths (deduped, sorted)', () => {
    const root = n('Form', {}, [], [], [
      n('Input', {}, [{ propKey: 'value', source: 'state', path: 'form.email' }], []),
      n('Input', {}, [{ propKey: 'value', source: 'state', path: 'form.password' }],
        [{ event: 'change', action: { kind: 'setState', path: 'form.password', valueFromEvent: true } }]),
      n('Text', {}, [{ propKey: 'content', source: 'static', staticValue: 'x' }], []),
    ]);
    expect(collectStatePaths(root)).toEqual(['form.email', 'form.password']);
  });
});

describe('buildStateInit', () => {
  it('builds a nested object literal from dotted paths (leaves init to empty string)', () => {
    expect(buildStateInit(['form.email', 'form.password', 'count'])).toEqual({ form: { email: '', password: '' }, count: '' });
  });
  it('returns empty object for no paths', () => {
    expect(buildStateInit([])).toEqual({});
  });
});
