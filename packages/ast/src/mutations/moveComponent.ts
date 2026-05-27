import { collectIds } from '../ids/collectIds';
import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';

export interface MoveComponentInput {
  nodeId: string;
  newParentId: string;
  index?: number;
}

function findNode(root: ComponentNode, id: string): ComponentNode | undefined {
  if (root.id === id) return root;
  for (const c of root.children) {
    const hit = findNode(c, id);
    if (hit) return hit;
  }
  return undefined;
}

export function moveComponent(ast: SemanticUIAst, input: MoveComponentInput): SemanticUIAst {
  if (input.nodeId === ast.root.id) {
    throw new Error('moveComponent: cannot move root node');
  }
  const moving = findNode(ast.root, input.nodeId);
  if (!moving) throw new Error(`moveComponent: node "${input.nodeId}" not found in AST`);
  const newParent = findNode(ast.root, input.newParentId);
  if (!newParent) throw new Error(`moveComponent: new parent "${input.newParentId}" not found in AST`);

  if (collectIds(moving).has(input.newParentId)) {
    throw new Error('moveComponent: would create cycle (new parent is inside moving subtree)');
  }

  let detachedSubtree: ComponentNode | null = null;
  const detach = (n: ComponentNode): ComponentNode => {
    const kept: ComponentNode[] = [];
    for (const c of n.children) {
      if (c.id === input.nodeId) {
        detachedSubtree = c;
        continue;
      }
      kept.push(detach(c));
    }
    return { ...n, children: kept };
  };
  const rootAfterDetach = detach(ast.root);
  if (!detachedSubtree) throw new Error(`moveComponent: failed to detach "${input.nodeId}"`);
  const moved = detachedSubtree as ComponentNode;

  const attach = (n: ComponentNode): ComponentNode => {
    if (n.id === input.newParentId) {
      const children = [...n.children];
      const idx = input.index ?? children.length;
      children.splice(idx, 0, moved);
      return { ...n, children };
    }
    return { ...n, children: n.children.map(attach) };
  };

  return { ...ast, root: attach(rootAfterDetach) };
}
