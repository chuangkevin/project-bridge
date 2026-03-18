import { create } from 'zustand';

export interface ArchNode {
  id: string;
  nodeType: 'page' | 'component';
  name: string;
  position: { x: number; y: number };
  referenceFileId: string | null;
  referenceFileUrl: string | null;
  interactions?: Array<{ label: string; outcome: string }>;
  states?: string[];
  viewport?: 'mobile' | 'desktop' | null;
}

export interface ArchEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface ArchData {
  type: 'page' | 'component';
  subtype?: 'website' | 'app' | 'dashboard' | 'other';
  aiDecidePages?: boolean;
  nodes: ArchNode[];
  edges: ArchEdge[];
}

interface ArchStore {
  archData: ArchData | null;
  selectedNodeId: string | null;
  activeWizardStep: number;
  targetPage: string | null;
  isSaving: boolean;

  setArchData: (data: ArchData | null) => void;
  setSelectedNodeId: (id: string | null) => void;
  setActiveWizardStep: (step: number) => void;
  setTargetPage: (page: string | null) => void;
  patchArchData: (projectId: string, data: ArchData) => Promise<void>;
}

export const useArchStore = create<ArchStore>((set) => ({
  archData: null,
  selectedNodeId: null,
  activeWizardStep: 0,
  targetPage: null,
  isSaving: false,

  setArchData: (data) => set({ archData: data }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setActiveWizardStep: (step) => set({ activeWizardStep: step }),
  setTargetPage: (page) => set({ targetPage: page }),

  patchArchData: async (projectId, data) => {
    set({ archData: data, isSaving: true });
    try {
      await fetch(`/api/projects/${projectId}/architecture`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arch_data: data }),
      });
    } finally {
      set({ isSaving: false });
    }
  },
}));
