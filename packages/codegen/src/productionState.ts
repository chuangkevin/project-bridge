import type { ComponentNode } from '@designbridge/ast';

/** All state paths referenced by state-source bindings + setState events, deduped + sorted. */
export function collectStatePaths(root: ComponentNode): string[] {
  const set = new Set<string>();
  const walk = (n: ComponentNode): void => {
    for (const b of n.bindings) if (b.source === 'state' && typeof b.path === 'string' && b.path) set.add(b.path);
    for (const e of n.events) if (e.action.kind === 'setState' && e.action.path) set.add(e.action.path);
    for (const c of n.children) walk(c);
  };
  walk(root);
  return [...set].sort();
}

type StateTree = { [k: string]: StateTree | string };

/** Build a nested object from dotted paths; leaves initialised to '' (stub default). */
export function buildStateInit(paths: string[]): StateTree {
  const root: StateTree = {};
  for (const p of paths) {
    const segs = p.split('.').filter(Boolean);
    let cur = root;
    segs.forEach((seg, i) => {
      if (i === segs.length - 1) { if (typeof cur[seg] !== 'object') cur[seg] = ''; }
      else { if (typeof cur[seg] !== 'object') cur[seg] = {}; cur = cur[seg] as StateTree; }
    });
  }
  return root;
}
