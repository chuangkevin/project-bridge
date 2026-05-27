import type { SkillRule, RuleAssert } from './rule';
import type { ComponentRegistry } from '../registry/componentSpec';

const ASSERT_KEYS = ['hasDescendantOfType', 'missingDescendantOfType', 'hasChildOfType', 'requiredPropPresent'] as const;

function assertKeys(a: RuleAssert | Record<string, unknown> | undefined): string[] {
  return Object.keys(a ?? {}).filter(k => (ASSERT_KEYS as readonly string[]).includes(k));
}

/** Structural validation of one rule. Returns problems (empty = valid). */
export function validateRuleShape(rule: SkillRule): string[] {
  const e: string[] = [];
  if (!rule || typeof rule !== 'object') return ['rule is not an object'];
  if (typeof rule.id !== 'string' || rule.id.trim() === '') e.push('id must be a non-empty string');
  if (rule.severity !== 'error' && rule.severity !== 'warning') e.push(`severity must be "error" | "warning", got ${JSON.stringify(rule.severity)}`);
  if (!rule.when || typeof rule.when.type !== 'string' || rule.when.type.trim() === '') e.push('when.type must be a non-empty string');
  const keys = assertKeys(rule.assert as RuleAssert);
  if (keys.length !== 1) e.push(`assert must have exactly one predicate key (one of ${ASSERT_KEYS.join('/')}), got [${Object.keys(rule.assert ?? {}).join(', ')}]`);
  else {
    const v = (rule.assert as Record<string, unknown>)[keys[0]];
    if (typeof v !== 'string' || v.trim() === '') e.push(`assert.${keys[0]} must be a non-empty string`);
  }
  if (typeof rule.message !== 'string' || rule.message.trim() === '') e.push('message must be a non-empty string');
  return e;
}

function selectorKey(rule: SkillRule): string {
  return `${rule.when.type}|${JSON.stringify(rule.when.propEquals ?? {})}`;
}
function assertOf(rule: SkillRule): { key: string; value: string } {
  const k = assertKeys(rule.assert)[0] ?? '';
  return { key: k, value: String((rule.assert as Record<string, unknown>)[k] ?? '') };
}

/** Duplicate ids + contradictory same-selector asserts. */
export function detectRuleConflicts(rules: SkillRule[]): string[] {
  const out: string[] = [];
  const seen = new Map<string, number>();
  rules.forEach((r, i) => {
    if (seen.has(r.id)) out.push(`duplicate rule id "${r.id}" (rules ${seen.get(r.id)} and ${i})`);
    else seen.set(r.id, i);
  });
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      if (selectorKey(rules[i]) !== selectorKey(rules[j])) continue;
      const a = assertOf(rules[i]); const b = assertOf(rules[j]);
      const contradictory =
        (a.key === 'hasDescendantOfType' && b.key === 'missingDescendantOfType' && a.value === b.value) ||
        (a.key === 'missingDescendantOfType' && b.key === 'hasDescendantOfType' && a.value === b.value);
      if (contradictory) out.push(`conflict: rules "${rules[i].id}" and "${rules[j].id}" assert has/missing descendant "${a.value}" on the same selector "${rules[i].when.type}"`);
    }
  }
  return out;
}

/** Rules that can never meaningfully apply: unregistered when.type or assert target type. */
export function detectDeadRules(rules: SkillRule[], registry: ComponentRegistry): string[] {
  const out: string[] = [];
  const typeAsserts = new Set(['hasDescendantOfType', 'missingDescendantOfType', 'hasChildOfType']);
  for (const r of rules) {
    if (!registry[r.when.type]) out.push(`dead rule "${r.id}": unknown component type "${r.when.type}" in when`);
    const { key, value } = assertOf(r);
    if (typeAsserts.has(key) && value && !registry[value]) out.push(`dead rule "${r.id}": assert.${key} references unknown component type "${value}"`);
  }
  return out;
}
