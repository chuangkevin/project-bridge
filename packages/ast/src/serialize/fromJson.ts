import { validateAst } from '../schema/validate';
import type { ComponentRegistry } from '../registry/componentSpec';
import type { SemanticUIAst } from '../types/ast';

export interface FromJsonOptions {
  registry: ComponentRegistry;
}

/**
 * Parses + validates a JSON string into a SemanticUIAst. Throws on malformed JSON or validation
 * failure. Pass the registry to validate against — use BASE_COMPONENTS for the standard set, or
 * `{ ...BASE_COMPONENTS, ...projectRegistry }` for project extensions. An empty registry rejects
 * all component types as unknown.
 */
export function fromJson(text: string, opts: FromJsonOptions): SemanticUIAst {
  const parsed = JSON.parse(text);
  const result = validateAst(parsed, { registry: opts.registry });
  if (!result.valid) {
    const summary = result.errors.map(e => `  ${e.path}: ${e.message}`).join('\n');
    throw new Error(`fromJson: validation failed\n${summary}`);
  }
  return parsed as SemanticUIAst;
}
