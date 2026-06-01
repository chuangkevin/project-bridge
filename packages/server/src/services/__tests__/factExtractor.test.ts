import { describe, it, expect } from 'vitest';
import { parseFactsFromResponse } from '../factExtractor';

describe('parseFactsFromResponse', () => {
  it('returns empty array when no <facts> block', () => {
    expect(parseFactsFromResponse('just plain text')).toEqual([]);
  });

  it('returns parsed facts when block is well-formed', () => {
    const ai = 'sure, here is my answer.\n\n<facts>\n[{"kind":"requirement","text":"r1"},{"kind":"page","text":"p1"}]\n</facts>';
    const r = parseFactsFromResponse(ai);
    expect(r).toEqual([
      { kind: 'requirement', text: 'r1' },
      { kind: 'page', text: 'p1' },
    ]);
  });

  it('returns empty array when JSON is malformed', () => {
    const ai = '<facts>\n[malformed,,\n</facts>';
    expect(parseFactsFromResponse(ai)).toEqual([]);
  });

  it('returns empty array when the JSON is not an array', () => {
    const ai = '<facts>\n{"kind":"requirement","text":"r1"}\n</facts>';
    expect(parseFactsFromResponse(ai)).toEqual([]);
  });

  it('filters out invalid kinds', () => {
    const ai = '<facts>[{"kind":"foo","text":"x"},{"kind":"requirement","text":"r"}]</facts>';
    expect(parseFactsFromResponse(ai)).toEqual([{ kind: 'requirement', text: 'r' }]);
  });

  it('filters out items missing text', () => {
    const ai = '<facts>[{"kind":"requirement"},{"kind":"requirement","text":"ok"}]</facts>';
    expect(parseFactsFromResponse(ai)).toEqual([{ kind: 'requirement', text: 'ok' }]);
  });

  it('trims text and rejects empty after trim', () => {
    const ai = '<facts>[{"kind":"requirement","text":"  trimmed  "},{"kind":"page","text":"   "}]</facts>';
    expect(parseFactsFromResponse(ai)).toEqual([{ kind: 'requirement', text: 'trimmed' }]);
  });
});
