import type { SemanticUIAst } from '../types/ast';
import type { DataBinding } from '../types/dataBinding';
import type { EventBinding } from '../types/eventBinding';
import { addComponent } from './addComponent';
import { setProp } from './setProp';
import { removeComponent } from './removeComponent';
import { moveComponent } from './moveComponent';
import { addBinding } from './addBinding';
import { addEvent } from './addEvent';
import { addConstraintRef } from './addConstraintRef';

/**
 * The canonical mutation-op format the AI emits (one per the 7 primitives).
 * `applyMutationOps` folds a batch through the pure primitives. This IS the
 * "tool call" surface — provider-agnostic JSON, not native function-calling.
 */
export type MutationOp =
  | { op: 'addComponent'; parentId: string; type: string; props?: Record<string, unknown>; index?: number }
  | { op: 'setProp'; nodeId: string; key: string; value: unknown }
  | { op: 'removeComponent'; nodeId: string }
  | { op: 'moveComponent'; nodeId: string; newParentId: string; index?: number }
  | { op: 'addBinding'; nodeId: string; binding: DataBinding }
  | { op: 'addEvent'; nodeId: string; event: EventBinding }
  | { op: 'addConstraintRef'; nodeId: string; ruleId: string };

export type MutationOpKind = MutationOp['op'];

/**
 * Applies a batch of mutation ops in order, returning a new AST. Each op goes
 * through the corresponding pure primitive. Errors from a primitive propagate,
 * annotated with the op index. NOTE: an `addComponent` op cannot be referenced
 * by later ops in the same batch (the new id is generated); fully configure new
 * nodes via the addComponent op's `props`.
 */
export function applyMutationOps(ast: SemanticUIAst, ops: MutationOp[]): SemanticUIAst {
  let current = ast;
  ops.forEach((op, i) => {
    try {
      switch (op.op) {
        case 'addComponent':
          current = addComponent(current, { parentId: op.parentId, type: op.type, props: op.props, index: op.index }).ast;
          break;
        case 'setProp':
          current = setProp(current, { nodeId: op.nodeId, key: op.key, value: op.value });
          break;
        case 'removeComponent':
          current = removeComponent(current, { nodeId: op.nodeId });
          break;
        case 'moveComponent':
          current = moveComponent(current, { nodeId: op.nodeId, newParentId: op.newParentId, index: op.index });
          break;
        case 'addBinding':
          current = addBinding(current, { nodeId: op.nodeId, binding: op.binding });
          break;
        case 'addEvent':
          current = addEvent(current, { nodeId: op.nodeId, event: op.event });
          break;
        case 'addConstraintRef':
          current = addConstraintRef(current, { nodeId: op.nodeId, ruleId: op.ruleId });
          break;
        default: {
          throw new Error(`unknown mutation op "${(op as { op: string }).op}"`);
        }
      }
    } catch (err) {
      throw new Error(`op[${i}] (${(op as { op: string }).op}): ${(err as Error).message}`);
    }
  });
  return current;
}
