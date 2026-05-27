import { describe, it, expect } from 'vitest';
import type { SkillRule, RuleViolation } from '../skill/rule';

describe('SkillRule schema', () => {
  it('accepts an assert rule with a type selector', () => {
    const rule: SkillRule = {
      id: 'core.form.requires-button', description: 'A Form must contain a Button.', severity: 'error',
      when: { type: 'Form' }, assert: { hasDescendantOfType: 'Button' },
      message: 'A Form must contain at least one Button.',
    };
    expect(rule.severity).toBe('error');
    expect('hasDescendantOfType' in rule.assert).toBe(true);
  });

  it('accepts each assert predicate variant', () => {
    const a: SkillRule['assert'][] = [
      { hasDescendantOfType: 'Button' }, { missingDescendantOfType: 'Form' },
      { hasChildOfType: 'Input' }, { requiredPropPresent: 'label' },
    ];
    expect(a).toHaveLength(4);
  });

  it('accepts a when selector with propEquals', () => {
    const rule: SkillRule = {
      id: 'r.button.primary-needs-label', severity: 'warning',
      when: { type: 'Button', propEquals: { variant: 'primary' } },
      assert: { requiredPropPresent: 'label' }, message: 'A primary Button should have a label.',
    };
    expect(rule.when.propEquals?.variant).toBe('primary');
  });

  it('RuleViolation carries ruleId/nodeId/severity/message', () => {
    const v: RuleViolation = { ruleId: 'r.x', nodeId: 'n_1', severity: 'error', message: 'bad' };
    expect(v.nodeId).toBe('n_1');
  });
});
