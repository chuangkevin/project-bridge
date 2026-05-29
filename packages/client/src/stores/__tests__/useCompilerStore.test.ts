import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from '../../lib/compileApi';
import { useCompilerStore } from '../useCompilerStore';

const dto = (label: string) => ({
  ast: { schemaVersion: 1, artifactId: 'home', kind: 'page', root: { id: 'n_root', type: 'Button', props: { label }, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] } },
  violations: [], vue: { filename: 'Home.vue', code: `<template><button>${label}</button></template>` },
});

beforeEach(() => {
  vi.restoreAllMocks();
  useCompilerStore.setState({ projectId: 'p1', artifacts: [], activeArtifactId: null, stage: 'ast', isCompiling: false, threads: {} });
});

describe('useCompilerStore', () => {
  it('compileFromRequirement adds an artifact and selects it', async () => {
    vi.spyOn(api, 'compile').mockResolvedValue(dto('Go') as never);
    await useCompilerStore.getState().compileFromRequirement('a button');
    const s = useCompilerStore.getState();
    expect(s.artifacts).toHaveLength(1);
    expect(s.activeArtifactId).toBe(s.artifacts[0].id);
    expect(s.isCompiling).toBe(false);
  });

  it('applyEdit mutates the active artifact AST and updates its vue', async () => {
    vi.spyOn(api, 'compile').mockResolvedValue(dto('Go') as never);
    await useCompilerStore.getState().compileFromRequirement('a button');
    vi.spyOn(api, 'mutate').mockResolvedValue(dto('Submit') as never);
    await useCompilerStore.getState().applyEdit('rename to Submit');
    const active = useCompilerStore.getState().artifacts.find(a => a.id === useCompilerStore.getState().activeArtifactId);
    expect(active?.vue.code).toContain('Submit');
  });

  it('setStage updates the current pipeline stage', () => {
    useCompilerStore.getState().setStage('codegen');
    expect(useCompilerStore.getState().stage).toBe('codegen');
  });

  it('compileFromRequirement surfaces errors and clears isCompiling', async () => {
    vi.spyOn(api, 'compile').mockRejectedValue(new Error('AI failed'));
    await expect(useCompilerStore.getState().compileFromRequirement('x')).rejects.toThrow(/AI failed/);
    expect(useCompilerStore.getState().isCompiling).toBe(false);
  });

  it('compileMirrorFromUrl adds a mirror artifact and selects it on success', async () => {
    const mirrorDto = {
      ok: true as const,
      artifact: {
        kind: 'mirror' as const, id: 'mirror-1', sourceUrl: 'https://example.com', sourceType: 'url' as const,
        crawledAt: '2026-05-29T00:00:00Z',
        files: { html: 'page.html', css: 'styles.css', screenshot: 'screenshot.png' },
        warnings: [], editable: false as const,
      },
    };
    vi.spyOn(api, 'compileMirror').mockResolvedValue(mirrorDto);
    const outcome = await useCompilerStore.getState().compileMirrorFromUrl('https://example.com');
    expect(outcome).toEqual({ ok: true });
    const s = useCompilerStore.getState();
    expect(s.artifacts).toHaveLength(1);
    expect(s.artifacts[0].kind).toBe('mirror');
    expect(s.activeArtifactId).toBe(s.artifacts[0].id);
  });

  it('compileMirrorFromUrl returns failure outcome on crawl error', async () => {
    vi.spyOn(api, 'compileMirror').mockResolvedValue({ ok: false, reason: 'crawl_timeout', detail: 'timeout' });
    const outcome = await useCompilerStore.getState().compileMirrorFromUrl('https://e.com');
    expect(outcome).toEqual({ ok: false, reason: 'crawl_timeout', detail: 'timeout' });
    expect(useCompilerStore.getState().artifacts).toHaveLength(0);
    expect(useCompilerStore.getState().isCompiling).toBe(false);
  });

  it('applyEdit refuses on a Mirror artifact', async () => {
    vi.spyOn(api, 'compileMirror').mockResolvedValue({
      ok: true,
      artifact: {
        kind: 'mirror', id: 'mirror-1', sourceUrl: 'x', sourceType: 'url', crawledAt: 'x',
        files: { html: 'page.html', css: 'styles.css', screenshot: 'screenshot.png' },
        warnings: [], editable: false,
      },
    });
    await useCompilerStore.getState().compileMirrorFromUrl('https://example.com');
    await expect(useCompilerStore.getState().applyEdit('x')).rejects.toThrow(/Mirror/i);
  });
});
