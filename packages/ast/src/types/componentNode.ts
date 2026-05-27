import type { LayoutIntent } from './layoutIntent';
import type { StyleIntent } from './styleIntent';
import type { DataBinding } from './dataBinding';
import type { EventBinding } from './eventBinding';
import type { RuleRef } from './ruleRef';

export interface ComponentNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
  layout: LayoutIntent;
  style: StyleIntent;
  bindings: DataBinding[];
  events: EventBinding[];
  constraints: RuleRef[];
  children: ComponentNode[];
}
