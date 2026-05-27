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
});
