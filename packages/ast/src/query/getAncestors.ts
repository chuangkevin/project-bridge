import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';

export function getAncestors(ast: SemanticUIAst, nodeId: string): ComponentNode[] {
  const chain: ComponentNode[] = [];
  const walk = (n: ComponentNode, stack: ComponentNode[]): boolean => {
    if (n.id === nodeId) {
      chain.push(...[...stack].reverse());
      return true;
    }
    stack.push(n);
    for (const c of n.children) {
      if (walk(c, stack)) return true;
    }
    stack.pop();
    return false;
  };
  walk(ast.root, []);
  return chain;
}
