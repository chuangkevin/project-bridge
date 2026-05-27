// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import InspectorPane from '../InspectorPane';
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

describe('InspectorPane', () => {
  it('shows empty state when there is no active artifact', () => {
    render(<InspectorPane />);
    expect(screen.getByText('No artifact selected.')).toBeTruthy();
  });

  it('renders the AST JSON (with root type) at stage ast', () => {
    const a = makeArtifact();
    useCompilerStore.setState({ artifacts: [a], activeArtifactId: a.id, stage: 'ast' });
    render(<InspectorPane />);
    expect(screen.getByText(/"type": "Button"/)).toBeTruthy();
  });

  it('renders a violation message at stage constraint', () => {
    const violation: RuleViolation = { ruleId: 'r.form-needs-submit', nodeId: 'n_root', severity: 'error', message: 'A form must contain a submit button.' };
    const a = makeArtifact([violation]);
    useCompilerStore.setState({ artifacts: [a], activeArtifactId: a.id, stage: 'constraint' });
    render(<InspectorPane />);
    expect(screen.getByText('A form must contain a submit button.')).toBeTruthy();
  });

  it('renders the code and a Copy button at stage codegen', () => {
    const a = makeArtifact();
    useCompilerStore.setState({ artifacts: [a], activeArtifactId: a.id, stage: 'codegen' });
    render(<InspectorPane />);
    expect(screen.getByText(/<button type="button">Go<\/button>/)).toBeTruthy();
    expect(screen.getByText('Copy')).toBeTruthy();
  });
});
