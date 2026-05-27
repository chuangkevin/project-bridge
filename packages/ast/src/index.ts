export { AST_SCHEMA_VERSION } from './version';

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

export { addComponent } from './mutations/addComponent';
export type { AddComponentInput, AddComponentResult } from './mutations/addComponent';
export { setProp } from './mutations/setProp';
export type { SetPropInput } from './mutations/setProp';
export { removeComponent } from './mutations/removeComponent';
export type { RemoveComponentInput } from './mutations/removeComponent';
export { moveComponent } from './mutations/moveComponent';
export type { MoveComponentInput } from './mutations/moveComponent';
export { addBinding } from './mutations/addBinding';
export type { AddBindingInput } from './mutations/addBinding';
export { addEvent } from './mutations/addEvent';
export type { AddEventInput } from './mutations/addEvent';
export { addConstraintRef } from './mutations/addConstraintRef';
export type { AddConstraintRefInput } from './mutations/addConstraintRef';

export { findNode } from './query/findNode';
export { getAncestors } from './query/getAncestors';
export { getDescendants } from './query/getDescendants';

export { structuralDiff } from './diff/structuralDiff';
export type { AstDiff } from './diff/structuralDiff';
