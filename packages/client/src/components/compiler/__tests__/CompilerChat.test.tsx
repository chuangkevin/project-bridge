// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import CompilerChat from '../CompilerChat';
import { useCompilerStore, type Artifact } from '../../../stores/useCompilerStore';
import * as compileApi from '../../../lib/compileApi';
import type { CompileResultDTO } from '../../../lib/compileApi';

const dto = (label: string): CompileResultDTO => ({
  ast: {
    schemaVersion: 1,
    artifactId: 'home',
    kind: 'page',
    root: { id: 'n_root', type: 'Button', props: { label }, layout: { kind: 'flow' } as never, style: {} as never, bindings: [], events: [], constraints: [], children: [] },
  },
  violations: [],
  vue: { filename: 'Home.vue', code: `<template><button>${label}</button></template>` },
});

const makeArtifact = (): Artifact => ({
  id: 'art_1',
  ast: dto('Go').ast,
  vue: dto('Go').vue,
  violations: [],
});

beforeEach(() => {
  vi.restoreAllMocks();
  useCompilerStore.setState({ projectId: 'p1', artifacts: [], activeArtifactId: null, stage: 'ast', isCompiling: false, threads: {} });
});

afterEach(() => cleanup());

describe('CompilerChat', () => {
  it('compiles a new artifact when none is active', async () => {
    const spy = vi.spyOn(compileApi, 'compile').mockResolvedValue(dto('Go'));
    render(<CompilerChat />);
    fireEvent.change(screen.getByLabelText('compiler chat input'), { target: { value: 'a form' } });
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledWith('p1', { artifactId: 'home', requirement: 'a form' });
  });

  it('applies an edit when an artifact is active', async () => {
    const a = makeArtifact();
    useCompilerStore.setState({ artifacts: [a], activeArtifactId: a.id });
    const spy = vi.spyOn(compileApi, 'mutate').mockResolvedValue(dto('Red'));
    render(<CompilerChat />);
    fireEvent.change(screen.getByLabelText('compiler chat input'), { target: { value: 'make it red' } });
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0][0]).toBe('p1');
    expect(spy.mock.calls[0][1].instruction).toBe('make it red');
  });

  it('renders an alert with the error message on failure and does not crash', async () => {
    vi.spyOn(compileApi, 'compile').mockRejectedValue(new Error('boom'));
    render(<CompilerChat />);
    fireEvent.change(screen.getByLabelText('compiler chat input'), { target: { value: 'a form' } });
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('boom');
  });
});
