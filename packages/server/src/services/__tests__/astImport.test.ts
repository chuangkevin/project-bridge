import { describe, it, expect } from 'vitest';
import {
  AST_SCHEMA_VERSION,
  BASE_COMPONENTS,
  validateAst,
  addComponent,
  generateNodeId,
} from '@designbridge/ast';

describe('@designbridge/ast — server-side import smoke', () => {
  it('AST_SCHEMA_VERSION is 1', () => {
    expect(AST_SCHEMA_VERSION).toBe(1);
  });
  it('BASE_COMPONENTS has 20 entries', () => {
    expect(Object.keys(BASE_COMPONENTS)).toHaveLength(20);
  });
  it('end-to-end: add a component, validate, get OK', () => {
    const ast = {
      schemaVersion: AST_SCHEMA_VERSION,
      artifactId: 'smoke',
      kind: 'page' as const,
      root: {
        id: generateNodeId(), type: 'Container', props: {},
        layout: { kind: 'stack' as const, direction: 'vertical' as const },
        style: {}, bindings: [], events: [], constraints: [], children: [],
      },
    };
    const { ast: after } = addComponent(ast, { parentId: ast.root.id, type: 'Text', props: { content: 'hi' } });
    const result = validateAst(after, { registry: BASE_COMPONENTS });
    expect(result.valid).toBe(true);
  });
});
