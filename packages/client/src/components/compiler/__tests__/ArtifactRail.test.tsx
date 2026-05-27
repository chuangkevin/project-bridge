// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ArtifactRail from '../ArtifactRail';
import { useCompilerStore, type Artifact } from '../../../stores/useCompilerStore';

const makeArtifact = (id: string, artifactId: string): Artifact => ({
  id,
  ast: {
    schemaVersion: 1,
    artifactId,
    kind: 'page',
    root: { id: 'n_root', type: 'Button', props: {}, layout: { kind: 'flow' } as never, style: {} as never, bindings: [], events: [], constraints: [], children: [] },
  },
  vue: { filename: `${artifactId}.vue`, code: '<template><div /></template>' },
  violations: [],
});

beforeEach(() => {
  useCompilerStore.setState({ projectId: 'p1', artifacts: [], activeArtifactId: null, stage: 'ast', isCompiling: false, threads: {} });
});

afterEach(() => cleanup());

describe('ArtifactRail', () => {
  it('shows empty state when there are no artifacts', () => {
    render(<ArtifactRail />);
    expect(screen.getByText('No artifacts yet')).toBeTruthy();
  });

  it('renders artifactId labels for each artifact', () => {
    const a = makeArtifact('art_1', 'home');
    const b = makeArtifact('art_2', 'page-2');
    useCompilerStore.setState({ artifacts: [a, b], activeArtifactId: a.id });
    render(<ArtifactRail />);
    expect(screen.getByText('home')).toBeTruthy();
    expect(screen.getByText('page-2')).toBeTruthy();
  });

  it('clicking the second artifact updates activeArtifactId', () => {
    const a = makeArtifact('art_1', 'home');
    const b = makeArtifact('art_2', 'page-2');
    useCompilerStore.setState({ artifacts: [a, b], activeArtifactId: a.id });
    render(<ArtifactRail />);
    fireEvent.click(screen.getByText('page-2'));
    expect(useCompilerStore.getState().activeArtifactId).toBe('art_2');
  });
});
