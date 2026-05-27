import { describe, it, expect } from 'vitest';
import type { LayoutIntent } from '../types/layoutIntent';

describe('LayoutIntent', () => {
  it('accepts a vertical stack with gap', () => {
    const layout: LayoutIntent = {
      kind: 'stack', direction: 'vertical', gap: 8, align: 'start', justify: 'start',
    };
    expect(layout.kind).toBe('stack');
  });
  it('accepts a grid with column template', () => {
    const layout: LayoutIntent = { kind: 'grid', columns: 3, gap: 16 };
    expect(layout.kind).toBe('grid');
  });
  it('accepts flow layout with no positional hints', () => {
    const layout: LayoutIntent = { kind: 'flow' };
    expect(layout.kind).toBe('flow');
  });
});

import type { StyleIntent } from '../types/styleIntent';

describe('StyleIntent', () => {
  it('accepts background + text + spacing tokens', () => {
    const style: StyleIntent = { background: 'surface-elevated', textColor: 'text-primary', padding: 16, borderRadius: 8 };
    expect(style.background).toBe('surface-elevated');
  });
  it('accepts raw color values (hex / rgb)', () => {
    const style: StyleIntent = { background: '#1e293b', textColor: 'rgb(241,245,249)' };
    expect(style.textColor).toMatch(/rgb/);
  });
  it('accepts empty object (style is optional in spirit)', () => {
    const style: StyleIntent = {};
    expect(Object.keys(style)).toHaveLength(0);
  });
});

import type { DataBinding } from '../types/dataBinding';
import type { EventBinding } from '../types/eventBinding';
import type { RuleRef } from '../types/ruleRef';

describe('DataBinding', () => {
  it('binds a prop to a state path', () => {
    const b: DataBinding = { propKey: 'value', source: 'state', path: 'form.email' };
    expect(b.source).toBe('state');
  });
  it('binds to an API endpoint', () => {
    const b: DataBinding = { propKey: 'items', source: 'api', endpoint: { method: 'GET', url: '/api/users' } };
    expect(b.endpoint?.method).toBe('GET');
  });
});

describe('EventBinding', () => {
  it('binds click to an action ref', () => {
    const e: EventBinding = { event: 'click', action: { kind: 'navigate', to: '/home' } };
    expect(e.event).toBe('click');
  });
  it('binds submit to an API call action', () => {
    const e: EventBinding = {
      event: 'submit',
      action: { kind: 'api', endpoint: { method: 'POST', url: '/api/login' }, payloadFromState: 'form' },
    };
    expect(e.action.kind).toBe('api');
  });
});

describe('RuleRef', () => {
  it('stores only the rule id', () => {
    const r: RuleRef = { ruleId: 'houseprice.member.required-fields' };
    expect(r.ruleId).toContain('.');
  });
});

import type { ComponentNode } from '../types/componentNode';
import type { SemanticUIAst } from '../types/ast';
import { AST_SCHEMA_VERSION } from '../index';

describe('ComponentNode', () => {
  it('is recursive — has children of same type', () => {
    const node: ComponentNode = {
      id: 'n_abc', type: 'Container', props: {},
      layout: { kind: 'stack', direction: 'vertical' }, style: {},
      bindings: [], events: [], constraints: [],
      children: [
        { id: 'n_def', type: 'Text', props: { content: 'hello' },
          layout: { kind: 'flow' }, style: {},
          bindings: [], events: [], constraints: [], children: [] },
      ],
    };
    expect(node.children[0]?.type).toBe('Text');
  });
});

describe('SemanticUIAst envelope', () => {
  it('carries schemaVersion + artifactId + root node', () => {
    const ast: SemanticUIAst = {
      schemaVersion: AST_SCHEMA_VERSION, artifactId: 'home-page', kind: 'page',
      root: { id: 'n_root', type: 'Container', props: {},
        layout: { kind: 'stack', direction: 'vertical' }, style: {},
        bindings: [], events: [], constraints: [], children: [] },
    };
    expect(ast.schemaVersion).toBe(1);
  });
});
