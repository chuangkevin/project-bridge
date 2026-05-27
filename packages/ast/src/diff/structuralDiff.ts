import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';

export interface AstDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

function indexById(root: ComponentNode): Map<string, ComponentNode> {
  const map = new Map<string, ComponentNode>();
  const walk = (n: ComponentNode): void => {
    map.set(n.id, n);
    for (const c of n.children) walk(c);
  };
  walk(root);
  return map;
}

function fieldsChanged(a: ComponentNode, b: ComponentNode): boolean {
  if (a.type !== b.type) return true;
  if (JSON.stringify(a.props) !== JSON.stringify(b.props)) return true;
  if (JSON.stringify(a.layout) !== JSON.stringify(b.layout)) return true;
  if (JSON.stringify(a.style) !== JSON.stringify(b.style)) return true;
  if (JSON.stringify(a.bindings) !== JSON.stringify(b.bindings)) return true;
  if (JSON.stringify(a.events) !== JSON.stringify(b.events)) return true;
  if (JSON.stringify(a.constraints) !== JSON.stringify(b.constraints)) return true;
  return false;
}

export function structuralDiff(before: SemanticUIAst, after: SemanticUIAst): AstDiff {
  const beforeIndex = indexById(before.root);
  const afterIndex = indexById(after.root);

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const id of afterIndex.keys()) {
    if (!beforeIndex.has(id)) added.push(id);
    else if (fieldsChanged(beforeIndex.get(id)!, afterIndex.get(id)!)) changed.push(id);
  }
  for (const id of beforeIndex.keys()) {
    if (!afterIndex.has(id)) removed.push(id);
  }

  return { added, removed, changed };
}
