import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import WorkspacePage from './pages/WorkspacePage';
import SharePage from './pages/SharePage';
import GlobalDesignPage from './pages/GlobalDesignPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import SetupPage from './pages/SetupPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return null;

  const token = localStorage.getItem('pb-auth-token');
  if (!token || !user) {
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
          <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
          <Route path="/project/:id" element={<ProtectedRoute><WorkspacePage /></ProtectedRoute>} />
          <Route path="/share/:token" element={<SharePage />} />
          <Route path="/global-design" element={<ProtectedRoute><GlobalDesignPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
