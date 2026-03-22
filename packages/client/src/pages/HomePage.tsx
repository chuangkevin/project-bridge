import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import NewProjectDialog from '../components/NewProjectDialog';
import DestructiveConfirmDialog from '../components/DestructiveConfirmDialog';
import { useAuth, authFetch } from '../contexts/AuthContext';

interface Project {
  id: string;
  name: string;
  share_token: string;
  created_at: string;
  updated_at: string;
  owner_id: string | null;
  owner_name: string | null;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  // SQLite datetime('now') produces UTC without 'Z' suffix — append it if missing
  const normalized = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  const then = new Date(normalized).getTime();
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
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/projects');
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

  const handleDeleteClick = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setDeleteTarget(project);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      const res = await authFetch(`/api/projects/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setProjects(prev => prev.filter(p => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      alert('刪除專案失敗');
    }
  };

  const handleFork = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const res = await authFetch(`/api/projects/${id}/fork`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to fork');
      const data = await res.json();
      navigate(`/project/${data.id}`);
    } catch {
      alert('Fork 專案失敗');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
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

  const myProjects = filteredProjects.filter(p => p.owner_id === user?.id);
  const othersProjects = filteredProjects.filter(p => p.owner_id !== user?.id);

  const canDelete = (project: Project) =>
    user?.role === 'admin' || project.owner_id === user?.id;

  const renderProjectCard = (project: Project, isOther: boolean) => (
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
        {project.owner_name && (
          <p style={styles.cardOwner}>by {project.owner_name}</p>
        )}
        <p style={styles.cardDate}>更新於 {relativeTime(project.updated_at)}</p>
      </div>
      <div style={styles.cardActions}>
        {isOther && (
          <button
            style={styles.forkBtn}
            onClick={(e) => handleFork(e, project.id)}
            title="Fork 專案"
            data-testid={`fork-project-${project.id}`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="5" cy="3" r="2" />
              <circle cx="11" cy="3" r="2" />
              <circle cx="8" cy="13" r="2" />
              <path d="M5 5v2a3 3 0 003 3m3-5v2a3 3 0 01-3 3" />
            </svg>
          </button>
        )}
        {canDelete(project) && (
          <button
            style={styles.deleteBtn}
            onClick={(e) => handleDeleteClick(e, project)}
            title="刪除專案"
            data-testid={`delete-project-${project.id}`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4M12.67 4v9.33a1.33 1.33 0 01-1.34 1.34H4.67a1.33 1.33 0 01-1.34-1.34V4" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>Project Bridge</h1>
          <span style={styles.subtitle}>AI-powered prototype generator</span>
        </div>
        <div style={styles.headerRight}>
          {user && (
            <div style={styles.userInfo}>
              <span style={styles.userName}>{user.name}</span>
              <button style={styles.logoutBtn} onClick={handleLogout} data-testid="logout-btn">
                登出
              </button>
            </div>
          )}
          <button style={styles.settingsBtn} onClick={() => navigate('/settings')} title="設定" data-testid="settings-btn">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="10" cy="10" r="3" />
              <path d="M10 1v2M10 17v2M1 10h2M17 10h2M3.93 3.93l1.41 1.41M14.66 14.66l1.41 1.41M3.93 16.07l1.41-1.41M14.66 5.34l1.41-1.41" />
            </svg>
          </button>
          <button type="button" style={styles.globalDesignBtn} onClick={() => navigate('/global-design')} data-testid="global-design-btn">
            全域設計
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
        {!loading && !error && filteredProjects.length > 0 && (
          <>
            {myProjects.length > 0 && (
              <div style={styles.section}>
                <div style={styles.sectionHeader}>
                  <h2 style={styles.sectionTitle}>我的專案</h2>
                  <span style={styles.countBadge}>{myProjects.length}</span>
                </div>
                <div style={styles.grid}>
                  {myProjects.map(project => renderProjectCard(project, false))}
                </div>
              </div>
            )}
            {othersProjects.length > 0 && (
              <div style={styles.section}>
                <div style={styles.sectionHeader}>
                  <h2 style={styles.sectionTitle}>其他人的專案</h2>
                  <span style={styles.countBadge}>{othersProjects.length}</span>
                </div>
                <div style={styles.grid}>
                  {othersProjects.map(project => renderProjectCard(project, true))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {showNewProject && (
        <NewProjectDialog
          onClose={() => setShowNewProject(false)}
          onCreated={handleProjectCreated}
        />
      )}

      <DestructiveConfirmDialog
        open={!!deleteTarget}
        title="刪除專案"
        message="此操作無法還原。將永久刪除此專案及所有相關資料。"
        confirmText={deleteTarget?.name ?? ''}
        confirmLabel="請輸入專案名稱以確認"
        buttonText="確認刪除"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
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
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginRight: '8px',
  },
  userName: {
    fontSize: '14px',
    color: '#1e293b',
    fontWeight: 500,
  },
  logoutBtn: {
    padding: '4px 10px',
    backgroundColor: 'transparent',
    color: '#64748b',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '13px',
    cursor: 'pointer',
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
  section: {
    marginBottom: '32px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    color: '#1e293b',
  },
  countBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '22px',
    height: '22px',
    padding: '0 6px',
    backgroundColor: '#e2e8f0',
    borderRadius: '11px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#64748b',
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
  cardOwner: {
    margin: '0 0 2px',
    fontSize: '12px',
    color: '#94a3b8',
  },
  cardDate: {
    margin: 0,
    fontSize: '13px',
    color: '#94a3b8',
  },
  cardActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
    marginLeft: '8px',
  },
  forkBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: '#3b82f6',
    cursor: 'pointer',
    flexShrink: 0,
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
  },
};
