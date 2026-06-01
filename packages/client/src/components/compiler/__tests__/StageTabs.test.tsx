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
  it('renders all four stage tabs (looked up by aria-label so visible labels can be localised)', () => {
    render(<StageTabs />);
    expect(screen.getByLabelText('Ingestion')).toBeTruthy();
    expect(screen.getByLabelText('AST')).toBeTruthy();
    expect(screen.getByLabelText('Constraint')).toBeTruthy();
    expect(screen.getByLabelText('Codegen')).toBeTruthy();
  });

  it('clicking the Codegen tab sets the store stage to codegen', () => {
    render(<StageTabs />);
    fireEvent.click(screen.getByLabelText('Codegen'));
    expect(useCompilerStore.getState().stage).toBe('codegen');
  });

  it('marks the active stage button with aria-pressed', () => {
    useCompilerStore.setState({ stage: 'ast' });
    render(<StageTabs />);
    expect(screen.getByLabelText('AST').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Codegen').getAttribute('aria-pressed')).toBe('false');
  });
});
