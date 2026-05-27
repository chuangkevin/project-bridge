import { validateAst } from '../schema/validate';
import type { ComponentRegistry } from '../registry/componentSpec';
import type { SemanticUIAst } from '../types/ast';

export interface FromJsonOptions {
  registry: ComponentRegistry;
}

export function fromJson(text: string, opts: FromJsonOptions): SemanticUIAst {
  const parsed = JSON.parse(text);
  const result = validateAst(parsed, { registry: opts.registry });
  if (!result.valid) {
    const summary = result.errors.map(e => `  ${e.path}: ${e.message}`).join('\n');
    throw new Error(`fromJson: validation failed\n${summary}`);
  }
  return parsed as SemanticUIAst;
}
