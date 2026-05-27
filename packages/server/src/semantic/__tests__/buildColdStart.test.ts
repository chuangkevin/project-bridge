import { describe, it, expect, vi } from 'vitest';
import { buildColdStart } from '../buildColdStart';
import type { IngestionAst } from '@designbridge/ast';

const ingestion: IngestionAst = { type: 'requirement', paragraphs: ['A login form with an email field and a submit button.'] };

const validAstJson = JSON.stringify({
  schemaVersion: 1, artifactId: 'login', kind: 'page',
  root: {
    id: 'n_root', type: 'Form', props: {}, layout: { kind: 'stack', direction: 'vertical' },
    style: {}, bindings: [], events: [], constraints: [],
    children: [
      { id: 'n_email', type: 'Input', props: { inputType: 'email', placeholder: 'Email' },
        layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] },
      { id: 'n_submit', type: 'Button', props: { label: 'Sign in' },
        layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] },
    ],
  },
});

describe('buildColdStart', () => {
  it('produces a validated SemanticUIAst from a valid AI response', async () => {
    const generate = vi.fn().mockResolvedValue(validAstJson);
    const ast = await buildColdStart(ingestion, { artifactId: 'login', generate });
    expect(ast.schemaVersion).toBe(1);
    expect(ast.root.type).toBe('Form');
    expect(ast.root.children.map(c => c.type)).toEqual(['Input', 'Button']);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('forces the returned artifactId/kind to the requested values', async () => {
    const generate = vi.fn().mockResolvedValue(validAstJson);
    const ast = await buildColdStart(ingestion, { artifactId: 'OVERRIDE', kind: 'element', generate });
    expect(ast.artifactId).toBe('OVERRIDE');
    expect(ast.kind).toBe('element');
  });

  it('repairs an invalid first response (unknown component type) then succeeds', async () => {
    const badJson = JSON.stringify({
      schemaVersion: 1, artifactId: 'login', kind: 'page',
      root: { id: 'n_root', type: 'NotAComponent', props: {}, layout: { kind: 'flow' }, style: {},
        bindings: [], events: [], constraints: [], children: [] },
    });
    const generate = vi.fn().mockResolvedValueOnce(badJson).mockResolvedValueOnce(validAstJson);
    const ast = await buildColdStart(ingestion, { artifactId: 'login', generate });
    expect(ast.root.type).toBe('Form');
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0].prompt).toMatch(/unknown component type/i);
  });

  it('injects the component catalog and the ingestion content into the prompt', async () => {
    const generate = vi.fn().mockResolvedValue(validAstJson);
    await buildColdStart(ingestion, { artifactId: 'login', generate });
    const call = generate.mock.calls[0][0];
    expect(call.systemInstruction).toMatch(/Available components/);
    expect(call.systemInstruction).toMatch(/Form|Input|Button/);
    expect(call.prompt).toMatch(/login form/i);
  });

  it('throws after exhausting repairs on persistently invalid output', async () => {
    const generate = vi.fn().mockResolvedValue('{"not":"an ast"}');
    await expect(buildColdStart(ingestion, { artifactId: 'login', generate, maxRepairs: 1 }))
      .rejects.toThrow(/failed validation/i);
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
