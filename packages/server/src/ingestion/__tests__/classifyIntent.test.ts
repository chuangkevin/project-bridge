import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../classifyIntent';

describe('classifyIntent', () => {
  it('returns pure-text when no URL and no attachment', () => {
    expect(classifyIntent({ text: 'build me a login page', attachments: [] })).toEqual({
      mode: 'pure-text',
      source: null,
      suggestedMode: 'pure-text',
    });
  });

  it('detects URL and returns source.url with suggestedMode unset', () => {
    const r = classifyIntent({ text: 'check this https://stripe.com/pricing thanks', attachments: [] });
    expect(r.source).toEqual({ kind: 'url', payload: 'https://stripe.com/pricing' });
    expect(r.suggestedMode).toBeUndefined();
    expect(r.mode).toBe('intent-card');
  });

  it('mirror-leaning phrases pre-select mirror', () => {
    const r = classifyIntent({ text: '完整複製這個網頁 https://example.com', attachments: [] });
    expect(r.suggestedMode).toBe('mirror');
  });

  it('AST-leaning phrases pre-select ast', () => {
    const r = classifyIntent({ text: '參考這個風格 https://example.com', attachments: [] });
    expect(r.suggestedMode).toBe('ast');
  });

  it('only returns the FIRST URL when multiple are present', () => {
    const r = classifyIntent({ text: 'https://a.com and https://b.com', attachments: [] });
    if (r.source?.kind !== 'url') throw new Error('expected url source');
    expect(r.source.payload).toBe('https://a.com');
  });

  it('image attachment → source.image (mode still intent-card)', () => {
    const r = classifyIntent({ text: 'this', attachments: [{ kind: 'image', mimeType: 'image/png', base64: 'x' }] });
    expect(r.source).toEqual({ kind: 'image', mimeType: 'image/png', base64: 'x' });
    expect(r.mode).toBe('intent-card');
  });

  it('mirror-hint with English keyword "pixel-perfect"', () => {
    const r = classifyIntent({ text: 'pixel-perfect copy of https://x.com', attachments: [] });
    expect(r.suggestedMode).toBe('mirror');
  });

  it('AST hint "inspired by"', () => {
    const r = classifyIntent({ text: 'inspired by https://x.com', attachments: [] });
    expect(r.suggestedMode).toBe('ast');
  });

  it('hints without source still yield pure-text + undefined suggested', () => {
    const r = classifyIntent({ text: '完整複製', attachments: [] });
    expect(r.mode).toBe('pure-text');
    expect(r.source).toBeNull();
  });
});
