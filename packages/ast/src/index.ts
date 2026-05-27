export const AST_SCHEMA_VERSION = 1;

export type { LayoutIntent } from './types/layoutIntent';
export type { StyleIntent } from './types/styleIntent';
export type { DataBinding, ApiEndpoint, BindingSource } from './types/dataBinding';
export type { EventBinding, EventName, Action } from './types/eventBinding';
export type { RuleRef } from './types/ruleRef';
export type { ComponentNode } from './types/componentNode';
export type { SemanticUIAst, ArtifactKind } from './types/ast';

export { generateNodeId } from './ids/generateNodeId';
export { collectIds, hasDuplicateIds } from './ids/collectIds';

export type { PropSpec, PropType, ComponentSpec, ComponentRegistry } from './registry/componentSpec';
export { BASE_COMPONENTS, getComponentSpec, registerComponent } from './registry/baseComponents';

export { AST_JSON_SCHEMA } from './schema/jsonSchema';
export { validateAst, isValidAst } from './schema/validate';
export type { ValidationError, ValidationResult, ValidateOptions } from './schema/validate';
