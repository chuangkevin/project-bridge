import Ajv from 'ajv';
import { AST_JSON_SCHEMA } from './jsonSchema';
import { hasDuplicateIds } from '../ids/collectIds';
import type { ComponentRegistry } from '../registry/componentSpec';
import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidateOptions {
  registry: ComponentRegistry;
}

const ajv = new Ajv({ allErrors: true, strict: false });
const ajvValidate = ajv.compile(AST_JSON_SCHEMA);

export function validateAst(ast: unknown, opts: ValidateOptions): ValidationResult {
  const errors: ValidationError[] = [];

  if (!ajvValidate(ast)) {
    for (const e of ajvValidate.errors ?? []) {
      errors.push({ path: e.instancePath || '/', message: `${e.message ?? 'invalid'}` });
    }
    return { valid: false, errors };
  }

  const typed = ast as SemanticUIAst;

  if (hasDuplicateIds(typed.root)) {
    errors.push({ path: '/root', message: 'duplicate node id detected' });
  }

  const walk = (n: ComponentNode, path: string): void => {
    const spec = opts.registry[n.type];
    if (!spec) {
      errors.push({ path, message: `unknown component type "${n.type}"` });
      return;
    }
    if (!spec.allowsChildren && n.children.length > 0) {
      errors.push({ path, message: `component "${n.type}" does not allow children` });
    }
    for (const [propKey, propSpec] of Object.entries(spec.props)) {
      if (propSpec.required && !(propKey in n.props)) {
        errors.push({ path: `${path}/props`, message: `missing required prop "${propKey}" for "${n.type}"` });
      }
      if (propKey in n.props && propSpec.type === 'enum' && propSpec.enumValues) {
        const v = n.props[propKey];
        if (typeof v === 'string' && !propSpec.enumValues.includes(v)) {
          errors.push({
            path: `${path}/props/${propKey}`,
            message: `prop "${propKey}" of "${n.type}" must be one of [${propSpec.enumValues.join(', ')}], got "${v}"`,
          });
        }
      }
    }
    n.children.forEach((c, i) => walk(c, `${path}/children/${i}`));
  };

  walk(typed.root, '/root');

  return { valid: errors.length === 0, errors };
}

export function isValidAst(ast: unknown, opts: ValidateOptions): boolean {
  return validateAst(ast, opts).valid;
}
