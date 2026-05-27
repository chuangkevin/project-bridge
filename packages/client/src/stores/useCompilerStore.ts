import { create } from 'zustand';
import type { SemanticUIAst, RuleViolation } from '@designbridge/ast';
import { compile, mutate, type VueArtifactDTO } from '../lib/compileApi';

export type CompilerStage = 'ingestion' | 'ast' | 'constraint' | 'codegen';

export interface Artifact {
  id: string;
  ast: SemanticUIAst;
  vue: VueArtifactDTO;
  violations: RuleViolation[];
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
  applyEdit: (instruction: string) => Promise<void>;
}

let counter = 0;
const nextArtifactId = () => `art_${Date.now().toString(36)}_${(counter++).toString(36)}`;
const slugForIndex = (n: number) => (n === 0 ? 'home' : `page-${n + 1}`);

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
      const artifact: Artifact = { id: nextArtifactId(), ast: r.ast, vue: r.vue, violations: r.violations };
      set((st) => ({ artifacts: [...st.artifacts, artifact], activeArtifactId: artifact.id, isCompiling: false }));
    } catch (err) {
      set({ isCompiling: false });
      throw err;
    }
  },

  applyEdit: async (instruction) => {
    const { projectId, artifacts, activeArtifactId } = get();
    const active = artifacts.find((a) => a.id === activeArtifactId);
    if (!active) throw new Error('no active artifact to edit');
    set({ isCompiling: true });
    try {
      const r = await mutate(projectId, { ast: active.ast, instruction });
      set((st) => ({
        artifacts: st.artifacts.map((a) => (a.id === active.id ? { ...a, ast: r.ast, vue: r.vue, violations: r.violations } : a)),
        isCompiling: false,
      }));
    } catch (err) {
      set({ isCompiling: false });
      throw err;
    }
  },
}));
