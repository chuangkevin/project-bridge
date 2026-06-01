// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CompilerWorkspace from '../../../pages/CompilerWorkspace';
import { useCompilerStore } from '../../../stores/useCompilerStore';

beforeEach(() => {
  useCompilerStore.setState({ projectId: '', artifacts: [], activeArtifactId: null, stage: 'ast', isCompiling: false, threads: {} });
});

afterEach(() => cleanup());

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/project/:id" element={<CompilerWorkspace />} />
      </Routes>
    </MemoryRouter>,
  );

describe('CompilerWorkspace', () => {
  it('sets the projectId from the route param on render', () => {
    renderAt('/project/p1');
    expect(useCompilerStore.getState().projectId).toBe('p1');
  });

  it('mounts StageTabs (all four stage aria-labels present)', () => {
    renderAt('/project/p1');
    expect(screen.getByLabelText('Ingestion')).toBeTruthy();
    expect(screen.getByLabelText('AST')).toBeTruthy();
    expect(screen.getByLabelText('Constraint')).toBeTruthy();
    expect(screen.getByLabelText('Codegen')).toBeTruthy();
  });

  it('mounts CompilerChat (chat input present)', () => {
    renderAt('/project/p1');
    expect(screen.getByLabelText('compiler chat input')).toBeTruthy();
  });

  it('shows an empty-state (no artifacts / no preview yet, in 繁中)', () => {
    renderAt('/project/p1');
    expect(screen.getByText(/尚無產出/)).toBeTruthy();
    expect(screen.getByText(/AI UI 編譯器/)).toBeTruthy();
  });
});
