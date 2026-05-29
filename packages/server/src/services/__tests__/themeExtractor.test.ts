import { describe, it, expect } from 'vitest';
import { extractTheme } from '../themeExtractor';

describe('extractTheme', () => {
  it('extracts palette / typography / radius / shadow from inline-style DOM', () => {
    const dom = '<html><body style="background:#1A73E8;color:#fff;font-family:Inter,sans-serif;font-size:16px"><h1 style="font-size:48px;font-weight:700;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,0.05)">Title</h1></body></html>';
    const out = extractTheme({ dom, css: 'h1{border-radius:8px}', sourceUrl: 'https://e.com' });

    expect(out.palette.map(p => p.value)).toEqual(expect.arrayContaining(['#1a73e8', '#ffffff']));
    expect(out.typography.primaryFont).toBe('Inter');
    expect(out.typography.headings.find(h => h.tag === 'h1')).toMatchObject({ fontSize: '48px', fontWeight: '700' });
    expect(out.radius).toContain('8px');
    expect(out.shadow.length).toBeGreaterThan(0);
  });

  it('returns empty arrays when nothing extractable', () => {
    const out = extractTheme({ dom: '<html></html>', css: '', sourceUrl: 'https://e.com' });
    expect(out.palette).toEqual([]);
    expect(out.typography.primaryFont).toBeNull();
    expect(out.radius).toEqual([]);
    expect(out.shadow).toEqual([]);
  });

  it('palette dedupes by hex value', () => {
    const dom = '<html><body style="color:#ABCDEF;background:#abcdef"><p style="color:#ABCDEF"></p></body></html>';
    const out = extractTheme({ dom, css: '', sourceUrl: 'x' });
    expect(out.palette.filter(p => p.value === '#abcdef').length).toBe(1);
  });

  it('rgb() values get normalized into the hex palette', () => {
    const dom = '<html><body style="color:rgb(26,115,232)"></body></html>';
    const out = extractTheme({ dom, css: '', sourceUrl: 'x' });
    expect(out.palette.map(p => p.value)).toContain('#1a73e8');
  });

  it('palette source is set to the sourceUrl', () => {
    const dom = '<html><body style="color:#abcdef"></body></html>';
    const out = extractTheme({ dom, css: '', sourceUrl: 'https://my-site.com' });
    expect(out.palette[0]?.source).toBe('https://my-site.com');
  });

  it('keeps secondary font as next-most-common', () => {
    const dom = '<html><body style="font-family:Inter,sans-serif"><p style="font-family:Roboto,sans-serif"></p><p style="font-family:Inter"></p></body></html>';
    const out = extractTheme({ dom, css: '', sourceUrl: 'x' });
    expect(out.typography.primaryFont).toBe('Inter');
    expect(out.typography.secondaryFont).toBe('Roboto');
  });
});
