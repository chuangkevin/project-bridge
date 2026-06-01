import { create } from 'zustand';

export type Mode = 'consult' | 'architect' | 'design';

interface WorkspaceState {
  projectId: string | null;
  mode: Mode;
  selectedTurnId: string | null;
  selectedFactId: string | null;
  selectedSkillName: string | null;
  rightCollapsed: boolean;
  mobileRailOpen: boolean;

  setProject: (id: string) => void;
  setMode: (m: Mode) => void;
  selectTurn: (id: string | null) => void;
  selectFact: (id: string | null) => void;
  selectSkill: (name: string | null) => void;
  toggleRight: () => void;
  setMobileRailOpen: (v: boolean) => void;
  reset: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  projectId: null,
  mode: 'consult',
  selectedTurnId: null,
  selectedFactId: null,
  selectedSkillName: null,
  rightCollapsed: false,
  mobileRailOpen: false,

  setProject: (id) => set({ projectId: id, selectedTurnId: null, selectedFactId: null, selectedSkillName: null }),
  setMode: (m) => set({ mode: m }),
  selectTurn: (id) => set({ selectedTurnId: id, selectedFactId: null, selectedSkillName: null }),
  selectFact: (id) => set({ selectedFactId: id, selectedTurnId: null, selectedSkillName: null }),
  selectSkill: (name) => set({ selectedSkillName: name, selectedTurnId: null, selectedFactId: null }),
  toggleRight: () => set((s) => ({ rightCollapsed: !s.rightCollapsed })),
  setMobileRailOpen: (v) => set({ mobileRailOpen: v }),
  reset: () => set({
    projectId: null, selectedTurnId: null, selectedFactId: null, selectedSkillName: null,
    rightCollapsed: false, mobileRailOpen: false,
  }),
}));
