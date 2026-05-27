import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';
import type { SkillRule, RuleWhen, RuleAssert, RuleViolation } from './rule';

export interface ApplySkillRulesResult {
  ast: SemanticUIAst;
  violations: RuleViolation[];
}

function subtreeHasType(node: ComponentNode, type: string): boolean {
  for (const c of node.children) {
    if (c.type === type) return true;
    if (subtreeHasType(c, type)) return true;
  }
  return false;
}

function matchesWhen(node: ComponentNode, when: RuleWhen): boolean {
  if (node.type !== when.type) return false;
  if (when.propEquals) {
    for (const [k, v] of Object.entries(when.propEquals)) {
      if (node.props[k] !== v) return false;
    }
  }
  return true;
}

function evalAssert(node: ComponentNode, assert: RuleAssert): boolean {
  if ('hasDescendantOfType' in assert) return subtreeHasType(node, assert.hasDescendantOfType);
  if ('missingDescendantOfType' in assert) return !subtreeHasType(node, assert.missingDescendantOfType);
  if ('hasChildOfType' in assert) return node.children.some(c => c.type === assert.hasChildOfType);
  if ('requiredPropPresent' in assert) return assert.requiredPropPresent in node.props;
  throw new Error(`applySkillRules: unknown assert predicate ${JSON.stringify(assert)}`);
}

/**
 * Build-time constraint pass (assert-only). Walks the AST pre-order; for each node matching a
 * rule's `when`, evaluates `assert` and collects a violation on failure. Returns the AST unchanged.
 * Deterministic: violations ordered by node pre-order, then rule order within a node.
 */
export function applySkillRules(ast: SemanticUIAst, rules: SkillRule[]): ApplySkillRulesResult {
  const violations: RuleViolation[] = [];
  const walk = (node: ComponentNode): void => {
    for (const rule of rules) {
      if (matchesWhen(node, rule.when) && !evalAssert(node, rule.assert)) {
        violations.push({ ruleId: rule.id, nodeId: node.id, severity: rule.severity, message: rule.message });
      }
    }
    for (const c of node.children) walk(c);
  };
  walk(ast.root);
  return { ast, violations };
}

/** True iff any violation is error-severity (the §6.12 "must pass all active rules" gate). */
export function hasErrorViolations(violations: RuleViolation[]): boolean {
  return violations.some(v => v.severity === 'error');
}
