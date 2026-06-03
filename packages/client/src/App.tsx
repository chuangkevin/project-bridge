import { Routes, Route, Navigate } from 'react-router-dom';
import ProjectsPage from './pages/ProjectsPage';
import WorkspacePage from './pages/WorkspacePage';
import SettingsPage from './pages/SettingsPage';
import GlobalDesignPage from './pages/GlobalDesignPage';
import SharePage from './pages/SharePage';
import { useViewportHeight } from './hooks/useViewportHeight';

/**
 * Root app router (M1 anonymous mode).
 *
 * Every route is open. No `/login` or `/setup` — the visitor lands on
 * `/projects` and can create/use any project. Admin password is prompted
 * inline by `SettingsPage` only when the operator hits Settings.
 */
export default function App() {
  useViewportHeight();

  return (
    <Routes>
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/projects/:id" element={<WorkspacePage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/global-design" element={<GlobalDesignPage />} />
      <Route path="/share/:token" element={<SharePage />} />
      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
  );
}
