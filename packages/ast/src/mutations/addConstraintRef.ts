import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';

export interface AddConstraintRefInput {
  nodeId: string;
  ruleId: string;
}

export function addConstraintRef(ast: SemanticUIAst, input: AddConstraintRefInput): SemanticUIAst {
  let found = false;
  const transform = (n: ComponentNode): ComponentNode => {
    if (n.id === input.nodeId) {
      found = true;
      if (n.constraints.some(r => r.ruleId === input.ruleId)) return n;
      return { ...n, constraints: [...n.constraints, { ruleId: input.ruleId }] };
    }
    return { ...n, children: n.children.map(transform) };
  };
  const newRoot = transform(ast.root);
  if (!found) throw new Error(`addConstraintRef: node "${input.nodeId}" not found in AST`);
  return { ...ast, root: newRoot };
}
