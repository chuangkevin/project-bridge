import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/useAuthStore';
import { api } from './lib/api';
import LoginPage from './pages/LoginPage';
import SetupPage from './pages/SetupPage';
import ProjectsPage from './pages/ProjectsPage';
import WorkspacePage from './pages/WorkspacePage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  const { user, loading, hydrate } = useAuthStore();
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  useEffect(() => { void hydrate(); }, [hydrate]);

  useEffect(() => {
    api<{ ok: boolean; userCount: number }>('/api/health')
      .then((h) => setNeedsSetup(h.userCount === 0))
      .catch(() => setNeedsSetup(false));
  }, []);

  if (loading || needsSetup === null) return <div style={{ padding: 24 }}>載入中…</div>;

  return (
    <Routes>
      <Route path="/setup" element={needsSetup ? <SetupPage /> : <Navigate to="/login" />} />
      <Route path="/login" element={user ? <Navigate to="/projects" /> : <LoginPage />} />
      <Route path="/projects" element={user ? <ProjectsPage /> : <Navigate to={needsSetup ? '/setup' : '/login'} />} />
      <Route path="/projects/:id" element={user ? <WorkspacePage /> : <Navigate to="/login" />} />
      <Route path="/settings" element={user ? <SettingsPage /> : <Navigate to="/login" />} />
      <Route path="*" element={<Navigate to={user ? '/projects' : (needsSetup ? '/setup' : '/login')} />} />
    </Routes>
  );
}
