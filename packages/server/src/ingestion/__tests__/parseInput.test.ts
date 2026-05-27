import { describe, it, expect } from 'vitest';
import { parseInput } from '../parseInput';

describe('parseInput dispatcher', () => {
  it('routes requirement input', async () => {
    const a = await parseInput({ kind: 'requirement', text: 'hello\n\nworld' });
    expect(a.type).toBe('requirement');
    if (a.type === 'requirement') expect(a.paragraphs).toEqual(['hello', 'world']);
  });

  it('routes pdf input via injected extractPages', async () => {
    const a = await parseInput({ kind: 'pdf', buffer: Buffer.from('x'), extractPages: async () => ['only page'] });
    expect(a.type).toBe('pdf');
    if (a.type === 'pdf') expect(a.pages[0]?.text).toBe('only page');
  });

  it('throws for a not-yet-implemented input kind', async () => {
    await expect(parseInput({ kind: 'screenshot' } as never)).rejects.toThrow(/not.*implemented|unsupported/i);
  });
});
