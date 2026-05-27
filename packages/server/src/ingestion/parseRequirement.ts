import type { RequirementIngestion } from '@designbridge/ast';

/**
 * Deterministically parse free text (chat message or pasted text) into a RequirementIngestion.
 * Splits on blank lines (one or more) into paragraphs; trims each; drops empties.
 * No AI — pure mechanical parsing (spec §4.3).
 */
export function parseRequirement(
  text: string,
  source: 'chat' | 'pasted-text' = 'chat',
): RequirementIngestion {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
  return { type: 'requirement', paragraphs, source };
}
