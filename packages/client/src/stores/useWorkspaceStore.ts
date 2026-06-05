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
  /** Desktop left-rail collapse — toggled by the ☰ button, persisted. */
  railCollapsed: boolean;

  setProject: (id: string) => void;
  setMode: (m: Mode) => void;
  selectTurn: (id: string | null) => void;
  selectFact: (id: string | null) => void;
  selectSkill: (name: string | null) => void;
  toggleRight: () => void;
  setMobileRailOpen: (v: boolean) => void;
  toggleRailCollapsed: () => void;
  reset: () => void;
}

const RAIL_COLLAPSED_KEY = 'designbridge.rail_collapsed';

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  projectId: null,
  mode: 'consult',
  selectedTurnId: null,
  selectedFactId: null,
  selectedSkillName: null,
  rightCollapsed: false,
  mobileRailOpen: false,
  railCollapsed: localStorage.getItem(RAIL_COLLAPSED_KEY) === 'true',

  setProject: (id) => set({ projectId: id, selectedTurnId: null, selectedFactId: null, selectedSkillName: null }),
  setMode: (m) => set({ mode: m }),
  selectTurn: (id) => set({ selectedTurnId: id, selectedFactId: null, selectedSkillName: null }),
  selectFact: (id) => set({ selectedFactId: id, selectedTurnId: null, selectedSkillName: null }),
  selectSkill: (name) => set({ selectedSkillName: name, selectedTurnId: null, selectedFactId: null }),
  toggleRight: () => set((s) => ({ rightCollapsed: !s.rightCollapsed })),
  setMobileRailOpen: (v) => set({ mobileRailOpen: v }),
  toggleRailCollapsed: () => set((s) => {
    const next = !s.railCollapsed;
    localStorage.setItem(RAIL_COLLAPSED_KEY, String(next));
    return { railCollapsed: next };
  }),
  reset: () => set({
    projectId: null, selectedTurnId: null, selectedFactId: null, selectedSkillName: null,
    rightCollapsed: false, mobileRailOpen: false,
  }),
}));
