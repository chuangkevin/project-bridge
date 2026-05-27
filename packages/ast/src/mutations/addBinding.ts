import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';
import type { DataBinding } from '../types/dataBinding';

export interface AddBindingInput {
  nodeId: string;
  binding: DataBinding;
}

export function addBinding(ast: SemanticUIAst, input: AddBindingInput): SemanticUIAst {
  let found = false;
  const transform = (n: ComponentNode): ComponentNode => {
    if (n.id === input.nodeId) {
      found = true;
      return { ...n, bindings: [...n.bindings, input.binding] };
    }
    return { ...n, children: n.children.map(transform) };
  };
  const newRoot = transform(ast.root);
  if (!found) throw new Error(`addBinding: node "${input.nodeId}" not found in AST`);
  return { ...ast, root: newRoot };
}
