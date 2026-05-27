import { describe, it, expect } from 'vitest';
import { toJson } from '../serialize/toJson';
import { fromJson } from '../serialize/fromJson';
import { BASE_COMPONENTS } from '../registry/baseComponents';
import { AST_SCHEMA_VERSION } from '../index';
import type { SemanticUIAst } from '../types/ast';

const ast: SemanticUIAst = {
  schemaVersion: AST_SCHEMA_VERSION,
  artifactId: 'home', kind: 'page',
  root: { id: 'n_root', type: 'Container', props: {}, layout: { kind: 'stack', direction: 'vertical' },
    style: {}, bindings: [], events: [], constraints: [], children: [] },
};

describe('serialization', () => {
  it('round-trips identically', () => {
    const json = toJson(ast);
    expect(typeof json).toBe('string');
    const parsed = fromJson(json, { registry: BASE_COMPONENTS });
    expect(parsed).toEqual(ast);
  });

  it('toJson is deterministic (key order stable)', () => {
    const j1 = toJson(ast);
    const j2 = toJson(ast);
    expect(j1).toBe(j2);
  });

  it('fromJson rejects an AST that fails validation', () => {
    const bad = JSON.stringify({ ...ast, schemaVersion: 999 });
    expect(() => fromJson(bad, { registry: BASE_COMPONENTS })).toThrow(/validation/i);
  });

  it('fromJson rejects malformed JSON', () => {
    expect(() => fromJson('{ not json', { registry: BASE_COMPONENTS })).toThrow();
  });
});
