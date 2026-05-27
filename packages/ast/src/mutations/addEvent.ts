import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';
import type { EventBinding } from '../types/eventBinding';

export interface AddEventInput {
  nodeId: string;
  event: EventBinding;
}

export function addEvent(ast: SemanticUIAst, input: AddEventInput): SemanticUIAst {
  let found = false;
  const transform = (n: ComponentNode): ComponentNode => {
    if (n.id === input.nodeId) {
      found = true;
      return { ...n, events: [...n.events, input.event] };
    }
    return { ...n, children: n.children.map(transform) };
  };
  const newRoot = transform(ast.root);
  if (!found) throw new Error(`addEvent: node "${input.nodeId}" not found in AST`);
  return { ...ast, root: newRoot };
}
