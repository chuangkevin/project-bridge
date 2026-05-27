import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';

export function findNode(ast: SemanticUIAst, nodeId: string): ComponentNode | undefined {
  const walk = (n: ComponentNode): ComponentNode | undefined => {
    if (n.id === nodeId) return n;
    for (const c of n.children) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return undefined;
  };
  return walk(ast.root);
}
