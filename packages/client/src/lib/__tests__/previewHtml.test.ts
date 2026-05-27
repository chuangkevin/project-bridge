import { describe, it, expect } from 'vitest';
import { buildPreviewHtml, extractTemplateInner } from '../previewHtml';

const sfc = `<template>\n  <form class="flex flex-col">\n    <button type="button">Go</button>\n  </form>\n</template>\n`;

describe('extractTemplateInner', () => {
  it('returns the inner HTML of the <template>', () => {
    expect(extractTemplateInner(sfc).trim()).toBe('<form class="flex flex-col">\n    <button type="button">Go</button>\n  </form>');
  });
  it('returns the input unchanged if there is no template tag', () => {
    expect(extractTemplateInner('<div>x</div>')).toBe('<div>x</div>');
  });
});

describe('buildPreviewHtml', () => {
  const html = buildPreviewHtml(sfc);
  it('is a full HTML document with the Tailwind Play CDN', () => {
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('cdn.tailwindcss.com');
  });
  it('embeds the extracted template markup in the body', () => {
    expect(html).toContain('<button type="button">Go</button>');
    expect(html).not.toContain('<template>');
  });
});
