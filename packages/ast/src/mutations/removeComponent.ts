import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';

export interface RemoveComponentInput {
  nodeId: string;
}

export function removeComponent(ast: SemanticUIAst, input: RemoveComponentInput): SemanticUIAst {
  if (input.nodeId === ast.root.id) {
    throw new Error('removeComponent: cannot remove root node');
  }
  let removed = false;
  const transform = (n: ComponentNode): ComponentNode => {
    const filteredChildren: ComponentNode[] = [];
    for (const c of n.children) {
      if (c.id === input.nodeId) {
        removed = true;
        continue;
      }
      filteredChildren.push(transform(c));
    }
    return { ...n, children: filteredChildren };
  };
  const newRoot = transform(ast.root);
  if (!removed) throw new Error(`removeComponent: node "${input.nodeId}" not found in AST`);
  return { ...ast, root: newRoot };
}
