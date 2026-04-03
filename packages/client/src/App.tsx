import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import WorkspacePage from './pages/WorkspacePage';
import SharePage from './pages/SharePage';
import GlobalDesignPage from './pages/GlobalDesignPage';
import ComponentLibraryPage from './pages/ComponentLibraryPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import SetupPage from './pages/SetupPage';
import { AuthProvider } from './contexts/AuthContext';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public — no login required */}
          <Route path="/" element={<HomePage />} />
          <Route path="/project/:id" element={<WorkspacePage />} />
          <Route path="/share/:token" element={<SharePage />} />
          <Route path="/global-design" element={<GlobalDesignPage />} />
          <Route path="/components" element={<ComponentLibraryPage />} />
          {/* Login / Setup — identity picker */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup" element={<SetupPage />} />
          {/* Settings — admin only (checked inside SettingsPage) */}
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
