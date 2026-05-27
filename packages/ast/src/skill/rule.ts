// JSON-serializable skill/design rule schema. Deterministic build-time constraints — never enter
// an AI prompt (spec §4.4). Plan 4 implements ONLY assert rules; a `mutate` action is intentionally
// reserved for a later plan and NOT part of this schema yet.

export type RuleSeverity = 'error' | 'warning';

export interface RuleWhen {
  type: string;
  propEquals?: Record<string, unknown>;
}

export type RuleAssert =
  | { hasDescendantOfType: string }
  | { missingDescendantOfType: string }
  | { hasChildOfType: string }
  | { requiredPropPresent: string };

export interface SkillRule {
  id: string;
  description?: string;
  severity: RuleSeverity;
  when: RuleWhen;
  assert: RuleAssert;
  message: string;
}

export interface RuleViolation {
  ruleId: string;
  nodeId: string;
  severity: RuleSeverity;
  message: string;
}
