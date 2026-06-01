import { describe, it, expect, vi } from 'vitest';
import { buildColdStart } from '../buildColdStart';
import { ingestionToText, WEBPAGE_DOM_MAX_CHARS } from '../prompts';
import type { WebpageIngestion } from '@designbridge/ast';

describe('buildColdStart — webpage source', () => {
  it('produces a SemanticUIAst from a WebpageIngestion via webpage prompt path', async () => {
    const fakeGenerate = vi.fn(async () =>
      JSON.stringify({
        schemaVersion: 1,
        artifactId: 'ar_will_be_overwritten',
        kind: 'page',
        root: { id: 'n_root', type: 'Container', props: {}, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] },
      }),
    );
    const ing: WebpageIngestion = { type: 'webpage', url: 'https://e.com', dom: '<html><body><h1>Hi</h1></body></html>' };
    const ast = await buildColdStart(ing, { artifactId: 'ar_w1', generate: fakeGenerate });
    expect(ast.artifactId).toBe('ar_w1');
    expect(ast.root.type).toBe('Container');
    expect(fakeGenerate).toHaveBeenCalled();
    const call = fakeGenerate.mock.calls[0][0];
    expect(typeof call === 'object' && call !== null && 'prompt' in call).toBe(true);
    expect((call as { prompt: string }).prompt).toMatch(/https:\/\/e\.com/);
    expect((call as { prompt: string }).prompt).toContain('<h1>Hi</h1>');
  });

  it('truncates very large DOMs at WEBPAGE_DOM_MAX_CHARS', () => {
    const big = 'x'.repeat(WEBPAGE_DOM_MAX_CHARS + 5000);
    const text = ingestionToText({ type: 'webpage', url: 'https://e.com', dom: big });
    expect(text).toContain('<!-- truncated -->');
    expect(text.length).toBeLessThan(WEBPAGE_DOM_MAX_CHARS + 500);
  });

  it('does not truncate small DOMs', () => {
    const small = '<html><body><p>tiny</p></body></html>';
    const text = ingestionToText({ type: 'webpage', url: 'https://e.com', dom: small });
    expect(text).not.toContain('<!-- truncated -->');
    expect(text).toContain('<p>tiny</p>');
  });
});
