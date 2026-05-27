// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import PreviewPane from '../PreviewPane';
import { useCompilerStore, type Artifact } from '../../../stores/useCompilerStore';
import type { RuleViolation } from '@designbridge/ast';

const makeArtifact = (violations: RuleViolation[] = []): Artifact => ({
  id: 'art_1',
  ast: {
    schemaVersion: 1,
    artifactId: 'home',
    kind: 'page',
    root: { id: 'n_root', type: 'Button', props: {}, layout: { kind: 'flow' } as never, style: {} as never, bindings: [], events: [], constraints: [], children: [] },
  },
  vue: { filename: 'Home.vue', code: '<template><button type="button">Go</button></template>' },
  violations,
});

beforeEach(() => {
  useCompilerStore.setState({ projectId: 'p1', artifacts: [], activeArtifactId: null, stage: 'ast', isCompiling: false, threads: {} });
});

afterEach(() => cleanup());

describe('PreviewPane', () => {
  it('shows empty state when there is no active artifact', () => {
    render(<PreviewPane />);
    expect(screen.getByText('Describe a UI in chat to compile it.')).toBeTruthy();
  });

  it('renders a sandboxed iframe with the preview srcdoc at stage ast', () => {
    const a = makeArtifact();
    useCompilerStore.setState({ artifacts: [a], activeArtifactId: a.id, stage: 'ast' });
    render(<PreviewPane />);
    const iframe = screen.getByTitle('preview') as HTMLIFrameElement;
    const srcdoc = iframe.getAttribute('srcdoc') ?? '';
    expect(srcdoc).toContain('<button type="button">Go</button>');
    expect(srcdoc).toContain('cdn.tailwindcss.com');
  });

  it('shows the generated code in a <pre> at stage codegen', () => {
    const a = makeArtifact();
    useCompilerStore.setState({ artifacts: [a], activeArtifactId: a.id, stage: 'codegen' });
    render(<PreviewPane />);
    expect(screen.getByText(/<button type="button">Go<\/button>/)).toBeTruthy();
  });

  it('shows "No rule violations." at stage constraint with no violations', () => {
    const a = makeArtifact([]);
    useCompilerStore.setState({ artifacts: [a], activeArtifactId: a.id, stage: 'constraint' });
    render(<PreviewPane />);
    expect(screen.getByText('No rule violations.')).toBeTruthy();
  });
});
