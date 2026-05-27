import { AST_SCHEMA_VERSION } from '../index';

export const AST_JSON_SCHEMA = {
  $id: 'https://designbridge/ast.schema.json',
  type: 'object',
  required: ['schemaVersion', 'artifactId', 'kind', 'root'],
  additionalProperties: true,
  properties: {
    schemaVersion: { type: 'integer', const: AST_SCHEMA_VERSION },
    artifactId: { type: 'string', minLength: 1 },
    kind: { type: 'string', enum: ['page', 'element', 'multi-page', 'fragment'] },
    label: { type: 'string' },
    meta: { type: 'object' },
    root: { $ref: '#/$defs/componentNode' },
  },
  $defs: {
    componentNode: {
      type: 'object',
      required: ['id', 'type', 'props', 'layout', 'style', 'bindings', 'events', 'constraints', 'children'],
      additionalProperties: false,
      properties: {
        id: { type: 'string', pattern: '^n_[A-Za-z0-9_-]+$' },
        type: { type: 'string', minLength: 1 },
        props: { type: 'object' },
        layout: { type: 'object' },
        style: { type: 'object' },
        bindings: { type: 'array', items: { type: 'object' } },
        events: { type: 'array', items: { type: 'object' } },
        constraints: {
          type: 'array',
          items: {
            type: 'object',
            required: ['ruleId'],
            properties: { ruleId: { type: 'string', minLength: 1 } },
          },
        },
        children: { type: 'array', items: { $ref: '#/$defs/componentNode' } },
      },
    },
  },
} as const;
