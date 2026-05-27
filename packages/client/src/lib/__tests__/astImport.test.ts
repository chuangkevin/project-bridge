import { describe, it, expect } from 'vitest';
import {
  AST_SCHEMA_VERSION,
  BASE_COMPONENTS,
  validateAst,
  generateNodeId,
} from '@designbridge/ast';

describe('@designbridge/ast — client-side import smoke', () => {
  it('imports core symbols', () => {
    expect(AST_SCHEMA_VERSION).toBe(1);
    expect(Object.keys(BASE_COMPONENTS).length).toBeGreaterThan(0);
  });
  it('validates a minimal AST', () => {
    const ast = {
      schemaVersion: AST_SCHEMA_VERSION,
      artifactId: 'smoke', kind: 'page' as const,
      root: {
        id: generateNodeId(), type: 'Container', props: {},
        layout: { kind: 'flow' as const }, style: {},
        bindings: [], events: [], constraints: [], children: [],
      },
    };
    expect(validateAst(ast, { registry: BASE_COMPONENTS }).valid).toBe(true);
  });
});
