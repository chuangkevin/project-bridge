import { create } from 'zustand';
import type { SemanticUIAst, RuleViolation } from '@designbridge/ast';
import {
  compile,
  compileMirror,
  mutate,
  type VueArtifactDTO,
  type MirrorArtifactDTO,
} from '../lib/compileApi';

export type CompilerStage = 'ingestion' | 'ast' | 'constraint' | 'codegen';

export interface AstArtifact {
  kind: 'ast';
  id: string;
  ast: SemanticUIAst;
  vue: VueArtifactDTO;
  violations: RuleViolation[];
}

export interface MirrorArtifact {
  kind: 'mirror';
  id: string;
  sourceUrl: string;
  sourceType: 'url' | 'screenshot';
  crawledAt: string;
  warnings: Array<{ code: string; url?: string; detail?: string }>;
}

export type Artifact = AstArtifact | MirrorArtifact;

export interface CompileMirrorOutcome {
  ok: boolean;
  reason?: string;
  detail?: string;
}

interface CompilerState {
  projectId: string;
  artifacts: Artifact[];
  activeArtifactId: string | null;
  stage: CompilerStage;
  isCompiling: boolean;
  threads: Record<string, string[]>;
  setProjectId: (id: string) => void;
  setStage: (s: CompilerStage) => void;
  selectArtifact: (id: string) => void;
  compileFromRequirement: (requirement: string) => Promise<void>;
  compileMirrorFromUrl: (url: string) => Promise<CompileMirrorOutcome>;
  applyEdit: (instruction: string) => Promise<void>;
}

let counter = 0;
const nextArtifactId = (): string => `art_${Date.now().toString(36)}_${(counter++).toString(36)}`;
const slugForIndex = (n: number): string => (n === 0 ? 'home' : `page-${n + 1}`);
const slugForMirror = (n: number): string => `mirror-${n + 1}`;

function fromMirrorDto(dto: MirrorArtifactDTO): MirrorArtifact {
  return {
    kind: 'mirror',
    id: dto.id,
    sourceUrl: dto.sourceUrl,
    sourceType: dto.sourceType,
    crawledAt: dto.crawledAt,
    warnings: dto.warnings,
  };
}

export const useCompilerStore = create<CompilerState>((set, get) => ({
  projectId: '',
  artifacts: [],
  activeArtifactId: null,
  stage: 'ast',
  isCompiling: false,
  threads: {},

  setProjectId: (id) => set({ projectId: id }),
  setStage: (s) => set({ stage: s }),
  selectArtifact: (id) => set({ activeArtifactId: id }),

  compileFromRequirement: async (requirement) => {
    const { projectId, artifacts } = get();
    set({ isCompiling: true });
    try {
      const r = await compile(projectId, { artifactId: slugForIndex(artifacts.length), requirement });
      const artifact: AstArtifact = { kind: 'ast', id: nextArtifactId(), ast: r.ast, vue: r.vue, violations: r.violations };
      set((st) => ({ artifacts: [...st.artifacts, artifact], activeArtifactId: artifact.id, isCompiling: false }));
    } catch (err) {
      set({ isCompiling: false });
      throw err;
    }
  },

  compileMirrorFromUrl: async (url) => {
    const { projectId, artifacts } = get();
    const mirrorIndex = artifacts.filter((a) => a.kind === 'mirror').length;
    set({ isCompiling: true });
    try {
      const r = await compileMirror(projectId, { artifactId: slugForMirror(mirrorIndex), url });
      if (!r.ok) {
        set({ isCompiling: false });
        return { ok: false, reason: r.reason, detail: r.detail };
      }
      const artifact = fromMirrorDto(r.artifact);
      set((st) => ({ artifacts: [...st.artifacts, artifact], activeArtifactId: artifact.id, isCompiling: false }));
      return { ok: true };
    } catch (err) {
      set({ isCompiling: false });
      throw err;
    }
  },

  applyEdit: async (instruction) => {
    const { projectId, artifacts, activeArtifactId } = get();
    const active = artifacts.find((a) => a.id === activeArtifactId);
    if (!active) throw new Error('no active artifact to edit');
    if (active.kind !== 'ast') throw new Error('cannot edit a Mirror artifact (upgrade to AST first)');
    set({ isCompiling: true });
    try {
      const r = await mutate(projectId, { ast: active.ast, instruction });
      set((st) => ({
        artifacts: st.artifacts.map((a) =>
          a.id === active.id && a.kind === 'ast' ? { ...a, ast: r.ast, vue: r.vue, violations: r.violations } : a,
        ),
        isCompiling: false,
      }));
    } catch (err) {
      set({ isCompiling: false });
      throw err;
    }
  },
}));
