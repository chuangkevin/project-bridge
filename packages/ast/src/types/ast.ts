import type { ComponentNode } from './componentNode';

export type ArtifactKind = 'page' | 'element' | 'multi-page' | 'fragment';

export interface SemanticUIAst {
  /** Always equals AST_SCHEMA_VERSION (currently 1). The runtime validator (validateAst)
   *  rejects any other value; the TS type stays `number` so migration/negative-test code
   *  can represent other versions. */
  schemaVersion: number;
  artifactId: string;
  kind: ArtifactKind;
  root: ComponentNode;
  label?: string;
  meta?: Record<string, unknown>;
}
