import { describe, it, expect } from 'vitest';
import { renderMirror } from '../renderMirror';

describe('renderMirror', () => {
  it('injects a <base href> when missing (head present)', () => {
    const html = '<html><head></head><body><p>x</p></body></html>';
    const out = renderMirror({ html, baseHref: '/api/projects/p1/mirrors/ar_1/' });
    expect(out).toMatch(/<base href="\/api\/projects\/p1\/mirrors\/ar_1\/"/);
  });

  it('injects a <head> + <base> when neither is present', () => {
    const html = '<html><body><p>x</p></body></html>';
    const out = renderMirror({ html, baseHref: '/x/' });
    expect(out).toMatch(/<head><base href="\/x\/"><\/head>/);
  });

  it('does not duplicate a <base> when one already exists', () => {
    const html = '<html><head><base href="x"></head><body></body></html>';
    const out = renderMirror({ html, baseHref: '/api/projects/p1/mirrors/ar_1/' });
    const matches = out.match(/<base\b/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('preserves body content verbatim', () => {
    const html = '<html><body><h1>Hi</h1></body></html>';
    expect(renderMirror({ html, baseHref: '/x/' })).toContain('<h1>Hi</h1>');
  });

  it('falls back when no <html> tag', () => {
    const out = renderMirror({ html: '<p>fragment</p>', baseHref: '/x/' });
    expect(out).toMatch(/<base href="\/x\/"/);
    expect(out).toContain('<p>fragment</p>');
  });
});
