import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';

export interface SetPropInput {
  nodeId: string;
  key: string;
  value: unknown;
}

export function setProp(ast: SemanticUIAst, input: SetPropInput): SemanticUIAst {
  let found = false;
  const transform = (n: ComponentNode): ComponentNode => {
    if (n.id === input.nodeId) {
      found = true;
      return { ...n, props: { ...n.props, [input.key]: input.value } };
    }
    return { ...n, children: n.children.map(transform) };
  };
  const newRoot = transform(ast.root);
  if (!found) throw new Error(`setProp: node "${input.nodeId}" not found in AST`);
  return { ...ast, root: newRoot };
}
