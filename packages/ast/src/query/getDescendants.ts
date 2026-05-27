import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';
import { findNode } from './findNode';

export function getDescendants(ast: SemanticUIAst, nodeId: string): ComponentNode[] {
  const start = findNode(ast, nodeId);
  if (!start) return [];
  const out: ComponentNode[] = [];
  const walk = (n: ComponentNode): void => {
    for (const c of n.children) {
      out.push(c);
      walk(c);
    }
  };
  walk(start);
  return out;
}
