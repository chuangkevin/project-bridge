import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import HomePage from './pages/HomePage';
import WorkspacePage from './pages/WorkspacePage';
import SharePage from './pages/SharePage';
import GlobalDesignPage from './pages/GlobalDesignPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import SetupPage from './pages/SetupPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, hasUsers } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        Loading...
      </div>
    );
  }

  if (hasUsers === false) {
    return <Navigate to="/setup" replace />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/share/:token" element={<SharePage />} />
          <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
          <Route path="/project/:id" element={<RequireAuth><WorkspacePage /></RequireAuth>} />
          <Route path="/global-design" element={<RequireAuth><GlobalDesignPage /></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
