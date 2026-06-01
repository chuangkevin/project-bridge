// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ArtifactRail from '../ArtifactRail';
import { useCompilerStore, type Artifact } from '../../../stores/useCompilerStore';

const makeArtifact = (id: string, artifactId: string): Artifact => ({
  kind: 'ast',
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

const makeMirror = (id: string, sourceUrl: string): Artifact => ({
  kind: 'mirror',
  id,
  sourceUrl,
  sourceType: 'url',
  crawledAt: '2026-05-29T00:00:00Z',
  warnings: [],
});

beforeEach(() => {
  useCompilerStore.setState({ projectId: 'p1', artifacts: [], activeArtifactId: null, stage: 'ast', isCompiling: false, threads: {} });
});

afterEach(() => cleanup());

describe('ArtifactRail', () => {
  it('shows empty state when there are no artifacts', () => {
    render(<ArtifactRail />);
    expect(screen.getByText(/尚無產出/)).toBeTruthy();
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

  it('renders 🔒 icon for mirror artifacts', () => {
    const a = makeArtifact('art_1', 'home');
    const m = makeMirror('mirror-1', 'https://example.com');
    useCompilerStore.setState({ artifacts: [a, m], activeArtifactId: a.id });
    render(<ArtifactRail />);
    // mirror-1 button text should contain 🔒 (sibling span); art 'home' should not
    const mirrorBtn = screen.getByText('mirror-1').closest('button');
    const astBtn = screen.getByText('home').closest('button');
    expect(mirrorBtn?.textContent).toContain('🔒');
    expect(astBtn?.textContent).not.toContain('🔒');
  });
});
