import type { SkillRule } from './rule';

/** Built-in baseline rules. Plan 4 ships the first reference rule; more come in later plans. */
export const CORE_RULES: SkillRule[] = [
  {
    id: 'core.form.requires-button',
    description: 'A Form must contain at least one Button (e.g. a submit action).',
    severity: 'error',
    when: { type: 'Form' },
    assert: { hasDescendantOfType: 'Button' },
    message: 'A Form must contain at least one Button.',
  },
];
