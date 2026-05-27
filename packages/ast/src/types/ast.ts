import type { ComponentNode } from './componentNode';

export type ArtifactKind = 'page' | 'element' | 'multi-page' | 'fragment';

export interface SemanticUIAst {
  schemaVersion: number;
  artifactId: string;
  kind: ArtifactKind;
  root: ComponentNode;
  label?: string;
  meta?: Record<string, unknown>;
}
