import { describe, it, expect } from 'vitest';
import { escapeHtml, escapeAttr, sanitizeArbitrary } from '../escape';

describe('escapeHtml', () => {
  it('escapes &, <, >', () => { expect(escapeHtml('a & b <script>')).toBe('a &amp; b &lt;script&gt;'); });
  it('handles non-string input by coercing', () => { expect(escapeHtml(undefined as unknown as string)).toBe(''); });
});
describe('escapeAttr', () => {
  it('escapes double quotes and angle brackets', () => { expect(escapeAttr('x"y<z>')).toBe('x&quot;y&lt;z&gt;'); });
});
describe('sanitizeArbitrary', () => {
  it('keeps a normal css value', () => {
    expect(sanitizeArbitrary('#1e293b')).toBe('#1e293b');
    expect(sanitizeArbitrary('16px')).toBe('16px');
    expect(sanitizeArbitrary('1fr 2fr')).toBe('1fr_2fr');
  });
  it('drops a value containing class-breaking characters', () => {
    expect(sanitizeArbitrary('foo]bar')).toBeNull();
    expect(sanitizeArbitrary('a"b')).toBeNull();
    expect(sanitizeArbitrary('a<b')).toBeNull();
    expect(sanitizeArbitrary('')).toBeNull();
  });
});
