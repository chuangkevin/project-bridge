import { describe, it, expect, vi } from 'vitest';
import { buildColdStart } from '../buildColdStart';
import { ingestionToText } from '../prompts';
import type { ScreenshotIngestion } from '@designbridge/ast';

describe('buildColdStart — screenshot source', () => {
  it('produces a SemanticUIAst from a ScreenshotIngestion using screenshot prompt path', async () => {
    const fakeGenerate = vi.fn(async () =>
      JSON.stringify({
        schemaVersion: 1, artifactId: 'ar_s1', kind: 'page',
        root: { id: 'n_root', type: 'Container', props: {}, layout: { kind: 'stack', direction: 'vertical' }, style: {}, bindings: [], events: [], constraints: [], children: [] },
      }),
    );
    const ing: ScreenshotIngestion = {
      type: 'screenshot',
      ocrText: 'FooApp\nPricing\nGet started',
      regions: [
        { x: 0, y: 0, width: 1200, height: 80, text: 'Header' },
        { x: 0, y: 100, width: 1200, height: 500, text: 'Hero' },
      ],
    };
    const ast = await buildColdStart(ing, { artifactId: 'ar_s1', generate: fakeGenerate });
    expect(ast.root.type).toBe('Container');
    const call = fakeGenerate.mock.calls[0][0];
    const prompt = (call as { prompt: string }).prompt;
    expect(prompt).toMatch(/FooApp/);
    expect(prompt).toMatch(/Header/);
    expect(prompt).toMatch(/Hero/);
  });

  it('ingestionToText for screenshot includes both OCR and regions', () => {
    const text = ingestionToText({
      type: 'screenshot',
      ocrText: 'hello world',
      regions: [{ x: 1, y: 2, width: 3, height: 4, text: 'Block' }],
    });
    expect(text).toContain('hello world');
    expect(text).toContain('Block');
    expect(text).toContain('(1,2)');
  });
});
