import { describe, it, expect } from 'vitest';
import { validateRuleShape, detectRuleConflicts, detectDeadRules } from '../skill/ruleChecks';
import { BASE_COMPONENTS } from '../index';
import type { SkillRule } from '../skill/rule';

const ok: SkillRule = { id: 'r.ok', severity: 'error', when: { type: 'Form' }, assert: { hasDescendantOfType: 'Button' }, message: 'm' };

describe('validateRuleShape', () => {
  it('accepts a well-formed rule', () => { expect(validateRuleShape(ok)).toEqual([]); });
  it('flags missing id / bad severity / empty when.type / no assert / empty message', () => {
    expect(validateRuleShape({ ...ok, id: '' }).length).toBeGreaterThan(0);
    expect(validateRuleShape({ ...ok, severity: 'fatal' as never }).length).toBeGreaterThan(0);
    expect(validateRuleShape({ ...ok, when: { type: '' } }).length).toBeGreaterThan(0);
    expect(validateRuleShape({ ...ok, assert: {} as never }).length).toBeGreaterThan(0);
    expect(validateRuleShape({ ...ok, message: '' }).length).toBeGreaterThan(0);
  });
  it('flags an assert with more than one predicate key', () => {
    expect(validateRuleShape({ ...ok, assert: { hasDescendantOfType: 'X', hasChildOfType: 'Y' } as never }).length).toBeGreaterThan(0);
  });
});

describe('detectRuleConflicts', () => {
  it('flags duplicate rule ids', () => {
    expect(detectRuleConflicts([ok, { ...ok }]).some(c => /duplicate/i.test(c))).toBe(true);
  });
  it('flags same-selector has vs missing of the same type', () => {
    const a: SkillRule = { id: 'r.a', severity: 'error', when: { type: 'Form' }, assert: { hasDescendantOfType: 'Button' }, message: 'm' };
    const b: SkillRule = { id: 'r.b', severity: 'error', when: { type: 'Form' }, assert: { missingDescendantOfType: 'Button' }, message: 'm' };
    expect(detectRuleConflicts([a, b]).some(c => /conflict/i.test(c))).toBe(true);
  });
  it('no conflict for different selectors', () => {
    const a: SkillRule = { id: 'r.a', severity: 'error', when: { type: 'Form' }, assert: { hasDescendantOfType: 'Button' }, message: 'm' };
    const b: SkillRule = { id: 'r.b', severity: 'error', when: { type: 'Card' }, assert: { missingDescendantOfType: 'Button' }, message: 'm' };
    expect(detectRuleConflicts([a, b])).toEqual([]);
  });
});

describe('detectDeadRules', () => {
  it('flags a rule whose when.type is not a registered component', () => {
    const dead: SkillRule = { id: 'r.dead', severity: 'error', when: { type: 'NotAType' }, assert: { hasChildOfType: 'Button' }, message: 'm' };
    expect(detectDeadRules([dead], BASE_COMPONENTS).some(c => /unknown component type "NotAType"/.test(c))).toBe(true);
  });
  it('flags an assert referencing an unregistered component type', () => {
    const dead: SkillRule = { id: 'r.d2', severity: 'error', when: { type: 'Form' }, assert: { hasDescendantOfType: 'Ghost' }, message: 'm' };
    expect(detectDeadRules([dead], BASE_COMPONENTS).some(c => /Ghost/.test(c))).toBe(true);
  });
  it('no dead flag for registered types', () => {
    expect(detectDeadRules([ok], BASE_COMPONENTS)).toEqual([]);
  });
});
