// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import CompilerChat from '../CompilerChat';
import { useCompilerStore, type AstArtifact, type Artifact } from '../../../stores/useCompilerStore';
import * as compileApi from '../../../lib/compileApi';
import type { CompileAstResult } from '../../../lib/compileApi';

const dto = (label: string): CompileAstResult => ({
  ast: {
    schemaVersion: 1,
    artifactId: 'home',
    kind: 'page',
    root: { id: 'n_root', type: 'Button', props: { label }, layout: { kind: 'flow' } as never, style: {} as never, bindings: [], events: [], constraints: [], children: [] },
  },
  violations: [],
  vue: { filename: 'Home.vue', code: `<template><button>${label}</button></template>` },
});

const makeArtifact = (): AstArtifact => ({
  kind: 'ast',
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

  it('shows MirrorIntentCard when input contains a URL on first send', async () => {
    render(<CompilerChat />);
    fireEvent.change(screen.getByLabelText('compiler chat input'), { target: { value: 'mirror this https://example.com' } });
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() => expect(screen.getByTestId('mirror-intent-card')).toBeTruthy());
    expect(screen.getAllByText(/https:\/\/example\.com/).length).toBeGreaterThan(0);
  });

  it('confirming Mirror invokes compileMirror with the detected URL', async () => {
    const spy = vi.spyOn(compileApi, 'compileMirror').mockResolvedValue({
      ok: true,
      artifact: { kind: 'mirror', id: 'mirror-1', sourceUrl: 'https://example.com', sourceType: 'url', crawledAt: 'x', files: { html: 'page.html', css: 'styles.css', screenshot: 'screenshot.png' }, warnings: [], editable: false },
    });
    render(<CompilerChat />);
    fireEvent.change(screen.getByLabelText('compiler chat input'), { target: { value: '完整複製 https://example.com' } });
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() => expect(screen.getByTestId('mirror-intent-card')).toBeTruthy());
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0][1]).toMatchObject({ url: 'https://example.com' });
  });

  it('mirror failure surfaces an alert', async () => {
    vi.spyOn(compileApi, 'compileMirror').mockResolvedValue({ ok: false, reason: 'crawl_timeout' });
    render(<CompilerChat />);
    fireEvent.change(screen.getByLabelText('compiler chat input'), { target: { value: 'mirror https://example.com' } });
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() => expect(screen.getByTestId('mirror-intent-card')).toBeTruthy());
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/crawl_timeout/));
  });

  it('cancelling the intent card clears it', async () => {
    render(<CompilerChat />);
    fireEvent.change(screen.getByLabelText('compiler chat input'), { target: { value: 'https://example.com' } });
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() => expect(screen.getByTestId('mirror-intent-card')).toBeTruthy());
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByTestId('mirror-intent-card')).toBeNull();
  });

  it('no URL → goes straight to text compile (intent card NOT shown)', async () => {
    const spy = vi.spyOn(compileApi, 'compile').mockResolvedValue(dto('Go'));
    render(<CompilerChat />);
    fireEvent.change(screen.getByLabelText('compiler chat input'), { target: { value: 'just a login page' } });
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(screen.queryByTestId('mirror-intent-card')).toBeNull();
  });
});
