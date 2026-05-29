import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import * as compileService from '../../services/compile';
import * as store from '../../storage/artifactStore';
import * as mirrorStore from '../../storage/mirrorStore';
import * as mirrorBuilder from '../../services/mirrorBuilder';
import { compileHandler, mutateHandler, listArtifactsHandler, loadArtifactHandler } from '../compile';

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

describe('compileHandler — pure-text', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('400s when requirement is missing and no mirror mode', async () => {
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

describe('compileHandler — mirror mode', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('mode=mirror with source.url builds a mirror and returns metadata', async () => {
    const fakeMeta = {
      kind: 'mirror' as const, id: 'ar_m1', sourceUrl: 'https://example.com', sourceType: 'url' as const,
      crawledAt: '2026-05-29T00:00:00Z',
      files: { html: 'page.html', css: 'styles.css', screenshot: 'screenshot.png' },
      warnings: [], editable: false as const,
    };
    vi.spyOn(mirrorBuilder, 'buildMirror').mockResolvedValue({ ok: true, meta: fakeMeta } as never);

    const req = {
      params: { id: 'p1' },
      body: { mode: 'mirror', source: { kind: 'url', payload: 'https://example.com' }, artifactId: 'ar_m1' },
    } as unknown as Request;
    const res = mockRes();
    await compileHandler(req, res);
    expect(res._json).toMatchObject({ ok: true, artifact: { kind: 'mirror', id: 'ar_m1' } });
  });

  it('mode=mirror crawl failure returns ok:false with reason', async () => {
    vi.spyOn(mirrorBuilder, 'buildMirror').mockResolvedValue({ ok: false, reason: 'crawl_timeout', detail: 'timed out' } as never);
    const req = {
      params: { id: 'p1' },
      body: { mode: 'mirror', source: { kind: 'url', payload: 'https://e.com' } },
    } as unknown as Request;
    const res = mockRes();
    await compileHandler(req, res);
    expect(res._json).toMatchObject({ ok: false, reason: 'crawl_timeout' });
  });

  it('mode=mirror with source.image returns ok:false image_source_not_supported (10a only)', async () => {
    const req = {
      params: { id: 'p1' },
      body: { mode: 'mirror', source: { kind: 'image', mimeType: 'image/png', base64: 'x' } },
    } as unknown as Request;
    const res = mockRes();
    await compileHandler(req, res);
    expect(res._json).toMatchObject({ ok: false, reason: 'image_source_not_supported' });
  });

  it('mode=mirror without source 400s', async () => {
    const req = { params: { id: 'p1' }, body: { mode: 'mirror' } } as unknown as Request;
    const res = mockRes();
    await compileHandler(req, res);
    expect(res._status).toBe(400);
  });

  it('mode=ast with source.url falls back to requirement compile (10a no-op for ast)', async () => {
    vi.spyOn(compileService, 'compileFromInput').mockResolvedValue(fakeResult as never);
    const req = {
      params: { id: 'p1' },
      body: { mode: 'ast', source: { kind: 'url', payload: 'https://e.com' }, requirement: 'login page' },
    } as unknown as Request;
    const res = mockRes();
    await compileHandler(req, res);
    expect(res._json).toEqual(fakeResult);
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

describe('listArtifactsHandler', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('returns artifact entries with kind discriminator', () => {
    vi.spyOn(store, 'listArtifacts').mockReturnValue([
      { id: 'home', kind: 'ast' },
      { id: 'ar_m1', kind: 'mirror' },
    ]);
    const req = { params: { id: 'p1' } } as unknown as Request;
    const res = mockRes();
    listArtifactsHandler(req, res);
    expect(res._json).toEqual({
      artifacts: [
        { id: 'home', kind: 'ast' },
        { id: 'ar_m1', kind: 'mirror' },
      ],
    });
  });
});

describe('loadArtifactHandler', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('returns the ast when an AST artifact exists', () => {
    const fakeAst = { schemaVersion: 1, artifactId: 'home', kind: 'page', root: {} };
    vi.spyOn(store, 'loadArtifact').mockReturnValue(fakeAst as never);
    vi.spyOn(mirrorStore, 'loadMirrorMeta').mockReturnValue(null);
    const req = { params: { id: 'p1', artifactId: 'home' } } as unknown as Request;
    const res = mockRes();
    loadArtifactHandler(req, res);
    expect(res._json).toEqual({ kind: 'ast', ast: fakeAst });
  });
  it('returns mirror meta when only a Mirror exists', () => {
    const fakeMirror = {
      kind: 'mirror' as const, id: 'ar_m', sourceUrl: 'https://e.com', sourceType: 'url' as const,
      crawledAt: 'x', files: { html: 'page.html', css: 'styles.css', screenshot: 'screenshot.png' },
      warnings: [], editable: false as const,
    };
    vi.spyOn(store, 'loadArtifact').mockReturnValue(null);
    vi.spyOn(mirrorStore, 'loadMirrorMeta').mockReturnValue(fakeMirror);
    const req = { params: { id: 'p1', artifactId: 'ar_m' } } as unknown as Request;
    const res = mockRes();
    loadArtifactHandler(req, res);
    expect(res._json).toEqual({ kind: 'mirror', mirror: fakeMirror });
  });
  it('404s when neither AST nor Mirror exists', () => {
    vi.spyOn(store, 'loadArtifact').mockReturnValue(null);
    vi.spyOn(mirrorStore, 'loadMirrorMeta').mockReturnValue(null);
    const req = { params: { id: 'p1', artifactId: 'nope' } } as unknown as Request;
    const res = mockRes();
    loadArtifactHandler(req, res);
    expect(res._status).toBe(404);
  });
});
