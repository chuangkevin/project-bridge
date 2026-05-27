import { generateNodeId } from '../ids/generateNodeId';
import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';

export interface AddComponentInput {
  parentId: string;
  type: string;
  props?: Record<string, unknown>;
  index?: number;
}

export interface AddComponentResult {
  ast: SemanticUIAst;
  newNodeId: string;
}

/**
 * Appends (or inserts at `index`) a new child under `parentId`. Returns a new AST + the new node id.
 * Does NOT consult the component registry: it neither checks `allowsChildren` nor supplies required
 * props. Call `validateAst` after a sequence of mutations to catch structural/prop violations.
 */
export function addComponent(ast: SemanticUIAst, input: AddComponentInput): AddComponentResult {
  const newNodeId = generateNodeId();
  const newNode: ComponentNode = {
    id: newNodeId,
    type: input.type,
    props: input.props ?? {},
    layout: { kind: 'flow' },
    style: {},
    bindings: [],
    events: [],
    constraints: [],
    children: [],
  };

  let parentFound = false;
  const transform = (n: ComponentNode): ComponentNode => {
    if (n.id === input.parentId) {
      parentFound = true;
      const children = [...n.children];
      const idx = input.index ?? children.length;
      children.splice(idx, 0, newNode);
      return { ...n, children };
    }
    return { ...n, children: n.children.map(transform) };
  };
  const newRoot = transform(ast.root);

  if (!parentFound) {
    throw new Error(`addComponent: parent "${input.parentId}" not found in AST`);
  }
  return { ast: { ...ast, root: newRoot }, newNodeId };
}
