import { describe, it, expect } from 'vitest';
import { parseRequirement } from '../parseRequirement';

describe('parseRequirement', () => {
  it('splits on blank lines into trimmed paragraphs', () => {
    const r = parseRequirement('First para.\n\n  Second para.  \n\n\nThird.');
    expect(r.type).toBe('requirement');
    expect(r.paragraphs).toEqual(['First para.', 'Second para.', 'Third.']);
  });

  it('treats a single block as one paragraph', () => {
    const r = parseRequirement('just one line');
    expect(r.paragraphs).toEqual(['just one line']);
  });

  it('drops empty/whitespace-only input to zero paragraphs', () => {
    expect(parseRequirement('   \n\n  ').paragraphs).toEqual([]);
    expect(parseRequirement('').paragraphs).toEqual([]);
  });

  it('defaults source to "chat" and respects an explicit source', () => {
    expect(parseRequirement('x').source).toBe('chat');
    expect(parseRequirement('x', 'pasted-text').source).toBe('pasted-text');
  });

  it('collapses single newlines within a paragraph but keeps paragraph breaks', () => {
    const r = parseRequirement('line one\nline two\n\nnext para');
    expect(r.paragraphs).toEqual(['line one\nline two', 'next para']);
  });
});
