import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import * as compileService from '../../services/compile';
import { compileHandler, mutateHandler } from '../compile';

function mockRes() {
  const res = {} as Response & { _status?: number; _json?: unknown };
  res.status = vi.fn().mockImplementation((c: number) => { res._status = c; return res; });
  res.json = vi.fn().mockImplementation((b: unknown) => { res._json = b; return res; });
  return res;
}

const fakeResult = {
  ast: { schemaVersion: 1, artifactId: 'x', kind: 'page', root: { id: 'n_root', type: 'Container', props: {}, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] } },
  violations: [],
  vue: { filename: 'X.vue', code: '<template></template>' },
};

describe('compileHandler', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('400s when requirement is missing', async () => {
    const req = { params: { id: 'p1' }, body: {} } as unknown as Request;
    const res = mockRes();
    await compileHandler(req, res);
    expect(res._status).toBe(400);
  });
  it('returns the compile result on a valid requirement', async () => {
    vi.spyOn(compileService, 'compileFromInput').mockResolvedValue(fakeResult as never);
    const req = { params: { id: 'p1' }, body: { artifactId: 'x', requirement: 'a form' } } as unknown as Request;
    const res = mockRes();
    await compileHandler(req, res);
    expect(compileService.compileFromInput).toHaveBeenCalledWith(
      { kind: 'requirement', text: 'a form' },
      expect.objectContaining({ artifactId: 'x' }),
    );
    expect(res._json).toEqual(fakeResult);
  });
  it('500s with a message when the pipeline throws', async () => {
    vi.spyOn(compileService, 'compileFromInput').mockRejectedValue(new Error('AI exhausted repairs'));
    const req = { params: { id: 'p1' }, body: { artifactId: 'x', requirement: 'a form' } } as unknown as Request;
    const res = mockRes();
    await compileHandler(req, res);
    expect(res._status).toBe(500);
    expect((res._json as { error?: string }).error).toMatch(/AI exhausted repairs/);
  });
});

describe('mutateHandler', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('400s when ast or instruction is missing', async () => {
    const req = { params: { id: 'p1' }, body: { instruction: 'x' } } as unknown as Request;
    const res = mockRes();
    await mutateHandler(req, res);
    expect(res._status).toBe(400);
  });
  it('returns the mutation result', async () => {
    vi.spyOn(compileService, 'compileMutation').mockResolvedValue(fakeResult as never);
    const req = { params: { id: 'p1' }, body: { ast: fakeResult.ast, instruction: 'tweak' } } as unknown as Request;
    const res = mockRes();
    await mutateHandler(req, res);
    expect(compileService.compileMutation).toHaveBeenCalled();
    expect(res._json).toEqual(fakeResult);
  });
});
