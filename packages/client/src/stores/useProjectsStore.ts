import { create } from 'zustand';
import { api } from '../lib/api';

interface Project { id: string; name: string; createdAt: string; updatedAt: string; shareToken: string; }

interface State {
  projects: Project[];
  loading: boolean;
  list: () => Promise<void>;
  create: (name: string) => Promise<Project>;
}

export const useProjectsStore = create<State>((set, get) => ({
  projects: [],
  loading: false,
  list: async () => {
    set({ loading: true });
    const r = await api<{ projects: Project[] }>('/api/projects');
    set({ projects: r.projects, loading: false });
  },
  create: async (name) => {
    const p = await api<Project>('/api/projects', { method: 'POST', body: JSON.stringify({ name }) });
    set({ projects: [p, ...get().projects] });
    return p;
  },
}));
