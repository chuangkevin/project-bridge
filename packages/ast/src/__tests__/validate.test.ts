import { describe, it, expect } from 'vitest';
import { validateAst, isValidAst } from '../schema/validate';
import { BASE_COMPONENTS } from '../registry/baseComponents';
import { AST_SCHEMA_VERSION } from '../index';
import type { SemanticUIAst } from '../types/ast';

const minimalAst = (): SemanticUIAst => ({
  schemaVersion: AST_SCHEMA_VERSION,
  artifactId: 'home',
  kind: 'page',
  root: {
    id: 'n_root', type: 'Container', props: {},
    layout: { kind: 'stack', direction: 'vertical' },
    style: {}, bindings: [], events: [], constraints: [], children: [],
  },
});

describe('validateAst', () => {
  it('accepts a minimal valid AST', () => {
    const result = validateAst(minimalAst(), { registry: BASE_COMPONENTS });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects unknown component type', () => {
    const ast = minimalAst();
    ast.root.type = 'NotARealComponent';
    const result = validateAst(ast, { registry: BASE_COMPONENTS });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === '/root' && /unknown component type/i.test(e.message))).toBe(true);
  });

  it('rejects missing required prop (Heading.content)', () => {
    const ast = minimalAst();
    ast.root.children = [{
      id: 'n_h', type: 'Heading', props: { level: '1' },
      layout: { kind: 'flow' }, style: {},
      bindings: [], events: [], constraints: [], children: [],
    }];
    const result = validateAst(ast, { registry: BASE_COMPONENTS });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /required prop "content"/.test(e.message))).toBe(true);
  });

  it('rejects children on a leaf component (Image)', () => {
    const ast = minimalAst();
    ast.root.children = [{
      id: 'n_img', type: 'Image', props: { src: '/x.png' },
      layout: { kind: 'flow' }, style: {},
      bindings: [], events: [], constraints: [],
      children: [{ id: 'n_bad', type: 'Text', props: { content: 'x' },
        layout: { kind: 'flow' }, style: {},
        bindings: [], events: [], constraints: [], children: [] }],
    }];
    const result = validateAst(ast, { registry: BASE_COMPONENTS });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /does not allow children/.test(e.message))).toBe(true);
  });

  it('rejects duplicate node ids', () => {
    const ast = minimalAst();
    ast.root.children = [
      { id: 'n_dup', type: 'Text', props: { content: 'a' }, layout: { kind: 'flow' }, style: {},
        bindings: [], events: [], constraints: [], children: [] },
      { id: 'n_dup', type: 'Text', props: { content: 'b' }, layout: { kind: 'flow' }, style: {},
        bindings: [], events: [], constraints: [], children: [] },
    ];
    const result = validateAst(ast, { registry: BASE_COMPONENTS });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /duplicate node id/.test(e.message))).toBe(true);
  });

  it('rejects wrong schemaVersion', () => {
    const ast = minimalAst();
    ast.schemaVersion = 999;
    const result = validateAst(ast, { registry: BASE_COMPONENTS });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects a non-string value for an enum prop (Heading.level = number)', () => {
    const ast = minimalAst();
    ast.root.children = [{
      id: 'n_h', type: 'Heading', props: { content: 'Title', level: 1 },
      layout: { kind: 'flow' }, style: {},
      bindings: [], events: [], constraints: [], children: [],
    }];
    const result = validateAst(ast, { registry: BASE_COMPONENTS });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /must be a string enum value/.test(e.message))).toBe(true);
  });

  it('accepts a correct string value for an enum prop (Heading.level = "1")', () => {
    const ast = minimalAst();
    ast.root.children = [{
      id: 'n_h', type: 'Heading', props: { content: 'Title', level: '1' },
      layout: { kind: 'flow' }, style: {},
      bindings: [], events: [], constraints: [], children: [],
    }];
    const result = validateAst(ast, { registry: BASE_COMPONENTS });
    expect(result.valid).toBe(true);
  });
});

describe('isValidAst', () => {
  it('returns boolean shorthand', () => {
    expect(isValidAst(minimalAst(), { registry: BASE_COMPONENTS })).toBe(true);
  });
});
