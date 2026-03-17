import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import WorkspacePage from './pages/WorkspacePage';
import SharePage from './pages/SharePage';
import GlobalDesignPage from './pages/GlobalDesignPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/project/:id" element={<WorkspacePage />} />
        <Route path="/share/:token" element={<SharePage />} />
        <Route path="/global-design" element={<GlobalDesignPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
