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

import { applySkillRules, hasErrorViolations } from '../skill/applySkillRules';
import { AST_SCHEMA_VERSION } from '../index';
import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';

const node = (id: string, type: string, children: ComponentNode[] = [], props: Record<string, unknown> = {}): ComponentNode => ({
  id, type, props, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children,
});
const wrap = (root: ComponentNode): SemanticUIAst => ({ schemaVersion: AST_SCHEMA_VERSION, artifactId: 'a', kind: 'page', root });

const formRequiresButton: SkillRule = {
  id: 'core.form.requires-button', severity: 'error',
  when: { type: 'Form' }, assert: { hasDescendantOfType: 'Button' },
  message: 'A Form must contain at least one Button.',
};

describe('applySkillRules', () => {
  it('reports a violation when a Form has no Button descendant', () => {
    const ast = wrap(node('n_root', 'Container', [ node('n_form', 'Form', [ node('n_in', 'Input') ]) ]));
    const { ast: out, violations } = applySkillRules(ast, [formRequiresButton]);
    expect(out).toBe(ast);
    expect(violations).toEqual([
      { ruleId: 'core.form.requires-button', nodeId: 'n_form', severity: 'error', message: 'A Form must contain at least one Button.' },
    ]);
  });

  it('passes when a Form has a Button anywhere in its subtree', () => {
    const ast = wrap(node('n_root', 'Container', [ node('n_form', 'Form', [ node('n_wrap', 'Container', [ node('n_btn', 'Button') ]) ]) ]));
    expect(applySkillRules(ast, [formRequiresButton]).violations).toEqual([]);
  });

  it('does not match nodes of other types', () => {
    const ast = wrap(node('n_root', 'Container', [ node('n_card', 'Card') ]));
    expect(applySkillRules(ast, [formRequiresButton]).violations).toEqual([]);
  });

  it('emits one violation per matching node (multiple Forms)', () => {
    const ast = wrap(node('n_root', 'Container', [ node('n_f1', 'Form'), node('n_f2', 'Form', [ node('n_b', 'Button') ]) ]));
    expect(applySkillRules(ast, [formRequiresButton]).violations.map(v => v.nodeId)).toEqual(['n_f1']);
  });

  it('evaluates missingDescendantOfType (forbid)', () => {
    const rule: SkillRule = { id: 'r.btn.no-form', severity: 'warning', when: { type: 'Button' },
      assert: { missingDescendantOfType: 'Form' }, message: 'A Button must not contain a Form.' };
    const ast = wrap(node('n_root', 'Button', [ node('n_form', 'Form') ]));
    const { violations } = applySkillRules(ast, [rule]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.severity).toBe('warning');
  });

  it('evaluates hasChildOfType (direct child only)', () => {
    const rule: SkillRule = { id: 'r.form.direct-input', severity: 'error', when: { type: 'Form' },
      assert: { hasChildOfType: 'Input' }, message: 'A Form needs a direct Input child.' };
    const ast = wrap(node('n_root', 'Form', [ node('n_wrap', 'Container', [ node('n_in', 'Input') ]) ]));
    expect(applySkillRules(ast, [rule]).violations).toHaveLength(1);
  });

  it('evaluates requiredPropPresent', () => {
    const rule: SkillRule = { id: 'r.heading.content', severity: 'error', when: { type: 'Heading' },
      assert: { requiredPropPresent: 'content' }, message: 'Heading needs content.' };
    expect(applySkillRules(wrap(node('n_root', 'Heading', [], {})), [rule]).violations).toHaveLength(1);
    expect(applySkillRules(wrap(node('n_root', 'Heading', [], { content: 'Hi' })), [rule]).violations).toEqual([]);
  });

  it('honours propEquals in the when selector', () => {
    const rule: SkillRule = { id: 'r.primary.label', severity: 'warning',
      when: { type: 'Button', propEquals: { variant: 'primary' } },
      assert: { requiredPropPresent: 'label' }, message: 'primary Button needs a label.' };
    const ast = wrap(node('n_root', 'Container', [
      node('n_p', 'Button', [], { variant: 'primary' }),
      node('n_s', 'Button', [], { variant: 'secondary' }),
    ]));
    expect(applySkillRules(ast, [rule]).violations.map(v => v.nodeId)).toEqual(['n_p']);
  });

  it('runs multiple rules in deterministic pre-order × rule-order', () => {
    const r2: SkillRule = { id: 'r.heading.content', severity: 'error', when: { type: 'Heading' },
      assert: { requiredPropPresent: 'content' }, message: 'Heading needs content.' };
    const ast = wrap(node('n_root', 'Container', [ node('n_h', 'Heading'), node('n_form', 'Form') ]));
    const { violations } = applySkillRules(ast, [formRequiresButton, r2]);
    expect(violations.map(v => `${v.nodeId}:${v.ruleId}`)).toEqual(['n_h:r.heading.content', 'n_form:core.form.requires-button']);
  });
});

describe('hasErrorViolations', () => {
  it('is true iff any violation has error severity', () => {
    expect(hasErrorViolations([{ ruleId: 'r', nodeId: 'n', severity: 'warning', message: 'm' }])).toBe(false);
    expect(hasErrorViolations([{ ruleId: 'r', nodeId: 'n', severity: 'error', message: 'm' }])).toBe(true);
    expect(hasErrorViolations([])).toBe(false);
  });
});

import { CORE_RULES } from '../skill/coreRules';

describe('CORE_RULES', () => {
  it('contains the form-requires-button reference rule', () => {
    const rule = CORE_RULES.find(r => r.id === 'core.form.requires-button');
    expect(rule).toBeDefined();
    expect(rule?.severity).toBe('error');
    expect(rule?.when.type).toBe('Form');
  });

  it('flags a buttonless Form and clears once a Button is added', () => {
    expect(hasErrorViolations(applySkillRules(wrap(node('n_root', 'Form')), CORE_RULES).violations)).toBe(true);
    const withButton = wrap(node('n_root', 'Form', [ node('n_b', 'Button', [], { label: 'Submit' }) ]));
    expect(applySkillRules(withButton, CORE_RULES).violations).toEqual([]);
  });
});
