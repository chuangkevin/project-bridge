import { describe, it, expect } from 'vitest';
import { mergeTheme, type ThemeFile, type ThemeMergeChoice } from '../themeMerger';
import type { ThemeProposal } from '../themeExtractor';

const proposal: ThemeProposal = {
  palette: [{ value: '#aabbcc', source: 'x' }],
  typography: {
    primaryFont: 'Inter',
    secondaryFont: null,
    headings: [{ tag: 'h1', fontSize: '32px', fontWeight: '700' }],
    body: { fontFamily: 'Inter', fontSize: '16px' },
  },
  radius: ['4px'],
  shadow: ['0 1px 2px rgba(0,0,0,0.05)'],
  source: 'https://e.com',
};

describe('mergeTheme', () => {
  it('take-new replaces a section entirely', () => {
    const current: ThemeFile = {
      schemaVersion: 1, updatedAt: 'x',
      palette: [{ value: '#000', source: 'old' }],
      typography: { primaryFont: 'OldFont', secondaryFont: null, headings: [], body: null },
      radius: [], shadow: [],
    };
    const choice: ThemeMergeChoice = { palette: 'take-new', typography: 'keep', radius: 'keep', shadow: 'keep' };
    const out = mergeTheme(current, proposal, choice);
    expect(out.palette).toEqual([{ value: '#aabbcc', source: 'x' }]);
    expect(out.typography.primaryFont).toBe('OldFont');
  });

  it('union merges palette deduped by hex value', () => {
    const current: ThemeFile = {
      schemaVersion: 1, updatedAt: 'x',
      palette: [{ value: '#aabbcc', source: 'old' }, { value: '#112233', source: 'old' }],
      typography: { primaryFont: null, secondaryFont: null, headings: [], body: null },
      radius: [], shadow: [],
    };
    const choice: ThemeMergeChoice = { palette: 'union', typography: 'keep', radius: 'keep', shadow: 'keep' };
    const out = mergeTheme(current, proposal, choice);
    expect(out.palette.map(p => p.value).sort()).toEqual(['#112233', '#aabbcc']);
  });

  it('null current creates a new file from proposal where take-new selected', () => {
    const choice: ThemeMergeChoice = { palette: 'take-new', typography: 'take-new', radius: 'take-new', shadow: 'take-new' };
    const out = mergeTheme(null, proposal, choice);
    expect(out.palette[0].value).toBe('#aabbcc');
    expect(out.typography.primaryFont).toBe('Inter');
    expect(out.radius).toEqual(['4px']);
    expect(out.shadow.length).toBe(1);
    expect(out.schemaVersion).toBe(1);
  });

  it('union typography keeps current primary font if non-null and dedupes headings by tag', () => {
    const current: ThemeFile = {
      schemaVersion: 1, updatedAt: 'x', palette: [],
      typography: { primaryFont: 'OldFont', secondaryFont: null, headings: [{ tag: 'h1', fontSize: '24px', fontWeight: '600' }], body: null },
      radius: [], shadow: [],
    };
    const choice: ThemeMergeChoice = { palette: 'keep', typography: 'union', radius: 'keep', shadow: 'keep' };
    const out = mergeTheme(current, proposal, choice);
    expect(out.typography.primaryFont).toBe('OldFont');
    expect(out.typography.headings.length).toBe(1); // h1 deduped — current kept
  });

  it('keep returns current unchanged', () => {
    const current: ThemeFile = {
      schemaVersion: 1, updatedAt: 'x', palette: [{ value: '#000', source: 'old' }],
      typography: { primaryFont: 'OldFont', secondaryFont: null, headings: [], body: null },
      radius: ['12px'], shadow: ['none'],
    };
    const choice: ThemeMergeChoice = { palette: 'keep', typography: 'keep', radius: 'keep', shadow: 'keep' };
    const out = mergeTheme(current, proposal, choice);
    expect(out.palette).toEqual(current.palette);
    expect(out.radius).toEqual(['12px']);
    expect(out.shadow).toEqual(['none']);
  });
});
