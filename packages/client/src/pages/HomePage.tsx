import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import NewProjectDialog from '../components/NewProjectDialog';

interface Project {
  id: string;
  name: string;
  share_token: string;
  created_at: string;
  updated_at: string;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`;
  if (diffDay < 30) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name'>('newest');
  const navigate = useNavigate();

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error('Failed to fetch projects');
      const data = await res.json();
      setProjects(data);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm('確定要刪除此專案嗎？')) return;
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch {
      alert('刪除專案失敗');
    }
  };

  const handleProjectCreated = (project: Project) => {
    setShowNewProject(false);
    navigate(`/project/${project.id}`);
  };

  const filteredProjects = projects
    .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return a.name.localeCompare(b.name);
    });

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>Project Bridge</h1>
          <span style={styles.subtitle}>AI-powered prototype generator</span>
        </div>
        <div style={styles.headerRight}>
          <button style={styles.settingsBtn} onClick={() => navigate('/settings')} title="設定" data-testid="settings-btn">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="10" cy="10" r="3" />
              <path d="M10 1v2M10 17v2M1 10h2M17 10h2M3.93 3.93l1.41 1.41M14.66 14.66l1.41 1.41M3.93 16.07l1.41-1.41M14.66 5.34l1.41-1.41" />
            </svg>
          </button>
          <button type="button" style={styles.globalDesignBtn} onClick={() => navigate('/global-design')} data-testid="global-design-btn">
            🌐 全域設計
          </button>
          <button style={styles.newBtn} onClick={() => setShowNewProject(true)} data-testid="new-project-btn">
            + 新增專案
          </button>
        </div>
      </header>

      <main style={styles.main}>
        {loading && <p style={styles.loadingText}>載入專案中...</p>}
        {error && <p style={styles.errorText}>{error}</p>}
        {!loading && !error && projects.length === 0 && (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="#94a3b8" strokeWidth="2">
                <rect x="8" y="8" width="48" height="48" rx="6" />
                <line x1="20" y1="24" x2="44" y2="24" />
                <line x1="20" y1="32" x2="38" y2="32" />
                <line x1="20" y1="40" x2="32" y2="40" />
              </svg>
            </div>
            <p style={styles.emptyText}>尚無專案。建立一個開始吧！</p>
          </div>
        )}
        {!loading && !error && projects.length > 0 && (
          <div style={styles.toolbar}>
            <input
              type="text"
              placeholder="搜尋專案..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={styles.searchInput}
              data-testid="search-input"
            />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as 'newest' | 'oldest' | 'name')}
              style={styles.sortSelect}
              data-testid="sort-select"
              title="排序方式"
            >
              <option value="newest">最新</option>
              <option value="oldest">最舊</option>
              <option value="name">名稱 A-Z</option>
            </select>
          </div>
        )}
        {!loading && !error && projects.length > 0 && filteredProjects.length === 0 && (
          <div style={styles.emptyState}>
            <p style={styles.emptyText}>沒有找到符合的專案</p>
          </div>
        )}
        <div style={styles.grid}>
          {filteredProjects.map(project => (
            <div
              key={project.id}
              style={styles.card}
              data-testid={`project-card-${project.id}`}
              onClick={() => navigate(`/project/${project.id}`)}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                (e.currentTarget as HTMLDivElement).style.borderColor = '#3b82f6';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
                (e.currentTarget as HTMLDivElement).style.borderColor = '#e2e8f0';
              }}
            >
              <div style={styles.cardContent}>
                <h3 style={styles.cardTitle}>{project.name}</h3>
                <p style={styles.cardDate}>更新於 {relativeTime(project.updated_at)}</p>
              </div>
              <button
                style={styles.deleteBtn}
                onClick={(e) => handleDelete(e, project.id)}
                title="刪除專案"
                data-testid={`delete-project-${project.id}`}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4M12.67 4v9.33a1.33 1.33 0 01-1.34 1.34H4.67a1.33 1.33 0 01-1.34-1.34V4" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </main>

      {showNewProject && (
        <NewProjectDialog
          onClose={() => setShowNewProject(false)}
          onCreated={handleProjectCreated}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f8fafc',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 32px',
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e2e8f0',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '12px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 700,
    color: '#1e293b',
  },
  subtitle: {
    fontSize: '14px',
    color: '#64748b',
  },
  settingsBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    color: '#64748b',
    cursor: 'pointer',
  },
  globalDesignBtn: {
    padding: '8px 14px',
    backgroundColor: '#f5f3ff',
    color: '#7c3aed',
    border: '1px solid #ddd6fe',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  newBtn: {
    padding: '8px 16px',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  main: {
    maxWidth: '1000px',
    margin: '0 auto',
    padding: '32px',
  },
  loadingText: {
    textAlign: 'center' as const,
    color: '#64748b',
    fontSize: '14px',
  },
  errorText: {
    textAlign: 'center' as const,
    color: '#ef4444',
    fontSize: '14px',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '64px 0',
  },
  emptyIcon: {
    marginBottom: '16px',
  },
  emptyText: {
    color: '#64748b',
    fontSize: '16px',
  },
  toolbar: {
    display: 'flex',
    gap: '12px',
    marginBottom: '24px',
  },
  searchInput: {
    flex: 1,
    padding: '8px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    color: '#1e293b',
    backgroundColor: '#ffffff',
    outline: 'none',
  },
  sortSelect: {
    padding: '8px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    color: '#1e293b',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '16px',
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px',
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    cursor: 'pointer',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    transition: 'box-shadow 0.15s, border-color 0.15s',
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    margin: '0 0 4px',
    fontSize: '16px',
    fontWeight: 600,
    color: '#1e293b',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  cardDate: {
    margin: 0,
    fontSize: '13px',
    color: '#94a3b8',
  },
  deleteBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: '#94a3b8',
    cursor: 'pointer',
    flexShrink: 0,
    marginLeft: '8px',
  },
};
