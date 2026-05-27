import type { ComponentNode } from '../types/componentNode';

export function collectIds(root: ComponentNode): Set<string> {
  const out = new Set<string>();
  const walk = (n: ComponentNode): void => {
    out.add(n.id);
    for (const c of n.children) walk(c);
  };
  walk(root);
  return out;
}

export function hasDuplicateIds(root: ComponentNode): boolean {
  let count = 0;
  const seen = new Set<string>();
  const walk = (n: ComponentNode): void => {
    seen.add(n.id);
    count++;
    for (const c of n.children) walk(c);
  };
  walk(root);
  return seen.size !== count;
}
