// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import StageTabs from '../StageTabs';
import { useCompilerStore } from '../../../stores/useCompilerStore';

beforeEach(() => {
  useCompilerStore.setState({ projectId: 'p1', artifacts: [], activeArtifactId: null, stage: 'ast', isCompiling: false, threads: {} });
});

afterEach(() => cleanup());

describe('StageTabs', () => {
  it('renders all four stage labels', () => {
    render(<StageTabs />);
    expect(screen.getByText('Ingestion')).toBeTruthy();
    expect(screen.getByText('AST')).toBeTruthy();
    expect(screen.getByText('Constraint')).toBeTruthy();
    expect(screen.getByText('Codegen')).toBeTruthy();
  });

  it('clicking Codegen sets the store stage to codegen', () => {
    render(<StageTabs />);
    fireEvent.click(screen.getByText('Codegen'));
    expect(useCompilerStore.getState().stage).toBe('codegen');
  });

  it('marks the active stage button with aria-pressed', () => {
    useCompilerStore.setState({ stage: 'ast' });
    render(<StageTabs />);
    expect(screen.getByText('AST').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Codegen').getAttribute('aria-pressed')).toBe('false');
  });
});
