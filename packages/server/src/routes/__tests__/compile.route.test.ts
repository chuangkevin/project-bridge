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

  it('mode=mirror with source.image identified → runs as mirror+URL transparently', async () => {
    const visionMod = await import('../../services/visionIdentifySite');
    vi.spyOn(visionMod, 'identifySite').mockResolvedValue({ ok: true, url: 'https://identified.com' });
    const fakeMeta = {
      kind: 'mirror' as const, id: 'ar_si', sourceUrl: 'https://identified.com', sourceType: 'url' as const,
      crawledAt: '2026-05-29T00:00:00Z',
      files: { html: 'page.html', css: 'styles.css', screenshot: 'screenshot.png' },
      warnings: [], editable: false as const,
    };
    vi.spyOn(mirrorBuilder, 'buildMirror').mockResolvedValue({ ok: true, meta: fakeMeta } as never);
    const req = {
      params: { id: 'p1' },
      body: { mode: 'mirror', source: { kind: 'image', mimeType: 'image/png', base64: 'x' } },
    } as unknown as Request;
    const res = mockRes();
    await compileHandler(req, res);
    expect(res._json).toMatchObject({ ok: true, artifact: { kind: 'mirror', sourceUrl: 'https://identified.com' } });
  });

  it('mode=mirror with source.image unidentified → ok:false unidentified_screenshot', async () => {
    const visionMod = await import('../../services/visionIdentifySite');
    vi.spyOn(visionMod, 'identifySite').mockResolvedValue({ ok: false, reason: 'unknown_site' });
    const req = {
      params: { id: 'p1' },
      body: { mode: 'mirror', source: { kind: 'image', mimeType: 'image/png', base64: 'x' } },
    } as unknown as Request;
    const res = mockRes();
    await compileHandler(req, res);
    expect(res._json).toMatchObject({ ok: false, reason: 'unidentified_screenshot' });
  });

  it('mode=mirror with source.image + vision_unavailable returns vision_unavailable', async () => {
    const visionMod = await import('../../services/visionIdentifySite');
    vi.spyOn(visionMod, 'identifySite').mockResolvedValue({ ok: false, reason: 'vision_unavailable' });
    const req = {
      params: { id: 'p1' },
      body: { mode: 'mirror', source: { kind: 'image', mimeType: 'image/png', base64: 'x' } },
    } as unknown as Request;
    const res = mockRes();
    await compileHandler(req, res);
    expect(res._json).toMatchObject({ ok: false, reason: 'vision_unavailable' });
  });

  it('mode=ast with source.image runs parseScreenshot → buildColdStart → returns ast (no themeProposal)', async () => {
    const parseMod = await import('../../ingestion/parseScreenshot');
    vi.spyOn(parseMod, 'parseScreenshot').mockResolvedValue({
      ok: true,
      ingestion: { type: 'screenshot', ocrText: 'x', regions: [] },
    } as never);
    vi.spyOn(compileService, 'compileFromIngestion').mockResolvedValue(fakeResult as never);
    const req = {
      params: { id: 'p1' },
      body: { mode: 'ast', source: { kind: 'image', mimeType: 'image/png', base64: 'x' }, artifactId: 'ar_a' },
    } as unknown as Request;
    const res = mockRes();
    await compileHandler(req, res);
    const body = res._json as { ok: boolean; ast: unknown; themeProposal?: unknown };
    expect(body.ok).toBe(true);
    expect(body.ast).toBeDefined();
    expect(body.themeProposal).toBeUndefined();
  });

  it('mode=ast with source.image + vision_unavailable returns ok:false', async () => {
    const parseMod = await import('../../ingestion/parseScreenshot');
    vi.spyOn(parseMod, 'parseScreenshot').mockResolvedValue({ ok: false, reason: 'vision_unavailable', detail: 'no key' } as never);
    const req = {
      params: { id: 'p1' },
      body: { mode: 'ast', source: { kind: 'image', mimeType: 'image/png', base64: 'x' } },
    } as unknown as Request;
    const res = mockRes();
    await compileHandler(req, res);
    expect(res._json).toMatchObject({ ok: false, reason: 'vision_unavailable' });
  });

  it('mode=mirror without source 400s', async () => {
    const req = { params: { id: 'p1' }, body: { mode: 'mirror' } } as unknown as Request;
    const res = mockRes();
    await compileHandler(req, res);
    expect(res._status).toBe(400);
  });

  it('mode=ast with source.url crawls (cache miss), builds AST, returns ast+themeProposal', async () => {
    const parseMod = await import('../../ingestion/parseWebpage');
    const cacheMod = await import('../../services/ingestionCache');
    cacheMod.ingestionCache.clear();
    vi.spyOn(parseMod, 'parseWebpage').mockResolvedValue({
      ok: true,
      ingestion: { type: 'webpage', url: 'https://e.com', dom: '<html><body style="color:#abcdef"><h1 style="font-size:24px;font-weight:700">Hi</h1></body></html>' },
      assets: [],
    } as never);
    vi.spyOn(compileService, 'compileFromIngestion').mockResolvedValue(fakeResult as never);
    const req = {
      params: { id: 'p1' },
      body: { mode: 'ast', source: { kind: 'url', payload: 'https://e.com' }, artifactId: 'ar_a1' },
    } as unknown as Request;
    const res = mockRes();
    await compileHandler(req, res);
    const body = res._json as { ok: boolean; ast: unknown; themeProposal: { palette: unknown[] } };
    expect(body.ok).toBe(true);
    expect(body.ast).toBeDefined();
    expect(body.themeProposal).toBeDefined();
    expect(body.themeProposal.palette.length).toBeGreaterThan(0);
  });

  it('mode=ast with source.url crawl_timeout returns ok:false', async () => {
    const parseMod = await import('../../ingestion/parseWebpage');
    const cacheMod = await import('../../services/ingestionCache');
    cacheMod.ingestionCache.clear();
    vi.spyOn(parseMod, 'parseWebpage').mockResolvedValue({ ok: false, reason: 'crawl_timeout', detail: 'timed out' } as never);
    const req = {
      params: { id: 'p1' },
      body: { mode: 'ast', source: { kind: 'url', payload: 'https://e.com' } },
    } as unknown as Request;
    const res = mockRes();
    await compileHandler(req, res);
    expect(res._json).toMatchObject({ ok: false, reason: 'crawl_timeout' });
  });

  it('mode=ast with source.url reuses cached ingestion on second call', async () => {
    const parseMod = await import('../../ingestion/parseWebpage');
    const cacheMod = await import('../../services/ingestionCache');
    cacheMod.ingestionCache.clear();
    const parseSpy = vi.spyOn(parseMod, 'parseWebpage').mockResolvedValue({
      ok: true,
      ingestion: { type: 'webpage', url: 'https://e.com', dom: '<x/>' },
      assets: [],
    } as never);
    vi.spyOn(compileService, 'compileFromIngestion').mockResolvedValue(fakeResult as never);

    const make = (): Request =>
      ({ params: { id: 'p1' }, body: { mode: 'ast', source: { kind: 'url', payload: 'https://e.com' } } } as unknown as Request);

    await compileHandler(make(), mockRes());
    await compileHandler(make(), mockRes());
    expect(parseSpy).toHaveBeenCalledTimes(1);
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
