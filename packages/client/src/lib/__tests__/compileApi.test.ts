import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compile, mutate } from '../compileApi';
import type { SemanticUIAst } from '@designbridge/ast';

const result = { ast: { schemaVersion: 1, artifactId: 'x', kind: 'page', root: {} }, violations: [], vue: { filename: 'X.vue', code: '<template></template>' } };

beforeEach(() => { vi.restoreAllMocks(); });

describe('compile', () => {
  it('POSTs requirement to /api/projects/:id/compile and returns the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => result });
    vi.stubGlobal('fetch', fetchMock);
    const out = await compile('p1', { artifactId: 'home', requirement: 'a form' });
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/p1/compile', expect.objectContaining({ method: 'POST' }));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ artifactId: 'home', requirement: 'a form' });
    expect(out).toEqual(result);
  });
  it('throws with the server error message on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) }));
    await expect(compile('p1', { artifactId: 'x', requirement: 'y' })).rejects.toThrow(/boom/);
  });
});

describe('mutate', () => {
  it('POSTs ast+instruction to /compile/mutate', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => result });
    vi.stubGlobal('fetch', fetchMock);
    const ast = { schemaVersion: 1 } as unknown as SemanticUIAst;
    await mutate('p1', { ast, instruction: 'tweak' });
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/p1/compile/mutate', expect.objectContaining({ method: 'POST' }));
  });
});
