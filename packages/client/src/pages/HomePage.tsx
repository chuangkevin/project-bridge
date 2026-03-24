import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import NewProjectDialog from '../components/NewProjectDialog';
import ThemeToggle from '../components/ThemeToggle';
import { useAuth, authHeaders } from '../contexts/AuthContext';

interface Project {
  id: string;
  name: string;
  share_token: string;
  created_at: string;
  updated_at: string;
  owner_id?: string;
  owner_name?: string;
}

/** Normalize SQLite datetime strings (no TZ) to UTC */
function parseUTC(dateStr: string): number {
  // SQLite datetime('now') → '2026-03-23 17:00:00' (UTC but no Z)
  // JS treats it as local time without indicator — append Z to force UTC
  const s = dateStr.includes('T') || dateStr.includes('Z') || dateStr.includes('+') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  return new Date(s).getTime();
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = parseUTC(dateStr);
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

/** Apply saved order to projects, placing new (unseen) projects at the top */
function applyOrder(projects: Project[], savedOrder: string[]): Project[] {
  if (!savedOrder || savedOrder.length === 0) return projects;
  const orderMap = new Map(savedOrder.map((id, idx) => [id, idx]));
  const known = projects.filter(p => orderMap.has(p.id));
  const newProjects = projects.filter(p => !orderMap.has(p.id));
  known.sort((a, b) => orderMap.get(a.id)! - orderMap.get(b.id)!);
  return [...newProjects, ...known];
}

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name' | 'custom'>('custom');
  const [savedOrder, setSavedOrder] = useState<string[]>([]);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user, logout, requireAuth } = useAuth();
  const orderLoadedRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

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

  // Fetch saved project order
  const fetchOrder = useCallback(async () => {
    try {
      const res = await fetch('/api/users/preferences/project-order', {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.value && Array.isArray(data.value)) {
          setSavedOrder(data.value);
        }
      }
    } catch {
      // silently fail — order is optional
    } finally {
      orderLoadedRef.current = true;
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (user) {
      fetchOrder();
    } else {
      orderLoadedRef.current = true;
    }
  }, [user, fetchOrder]);

  const saveOrder = useCallback(async (order: string[]) => {
    setSavedOrder(order);
    try {
      await fetch('/api/users/preferences/project-order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ value: order }),
      });
    } catch {
      // silently fail
    }
  }, []);

  const handleLogin = async () => {
    await requireAuth();
  };

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteInput, setDeleteInput] = useState('');

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const project = projects.find(p => p.id === id);
    if (!project) return;
    setDeleteTarget({ id, name: project.name });
    setDeleteInput('');
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleteInput !== deleteTarget.name) return;
    try {
      const res = await fetch(`/api/projects/${deleteTarget.id}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to delete');
      setProjects(prev => prev.filter(p => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      alert('刪除專案失敗');
    }
  };

  const handleNewProject = async () => {
    await requireAuth();
    setShowNewProject(true);
  };

  const handleProjectCreated = (project: Project) => {
    setShowNewProject(false);
    navigate(`/project/${project.id}`);
  };

  const handleFork = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/projects/${id}/fork`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to fork');
      const forked = await res.json();
      navigate(`/project/${forked.id}`);
    } catch {
      alert('Fork 專案失敗');
    }
  };

  const isOwn = (p: Project) =>
    !user || p.owner_id === user.id || p.owner_id == null;

  // Apply sorting: if custom sort + no search, apply saved order; otherwise use standard sort
  const isCustomSort = sortBy === 'custom' && !searchQuery;

  const filteredProjects = projects
    .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const sortedProjects = isCustomSort
    ? applyOrder(filteredProjects, savedOrder)
    : [...filteredProjects].sort((a, b) => {
        if (sortBy === 'newest' || sortBy === 'custom') return parseUTC(b.created_at) - parseUTC(a.created_at);
        if (sortBy === 'oldest') return parseUTC(a.created_at) - parseUTC(b.created_at);
        return a.name.localeCompare(b.name);
      });

  const myProjects = sortedProjects.filter(isOwn);
  const othersProjects = sortedProjects.filter(p => !isOwn(p));
  const splitSections = !!user && myProjects.length > 0 && othersProjects.length > 0;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Determine which list the drag happened in
    const activeId = active.id as string;
    const overId = over.id as string;

    // Only reorder within "my projects" section
    const myIds = myProjects.map(p => p.id);
    if (myIds.includes(activeId) && myIds.includes(overId)) {
      const oldIndex = myIds.indexOf(activeId);
      const newIndex = myIds.indexOf(overId);
      const reordered = arrayMove(myProjects, oldIndex, newIndex);
      // Build full order: reordered my projects + others (preserving others order)
      const newOrder = [...reordered.map(p => p.id), ...othersProjects.map(p => p.id)];
      saveOrder(newOrder);
    }

    // Reorder within "others projects" section
    const othersIds = othersProjects.map(p => p.id);
    if (othersIds.includes(activeId) && othersIds.includes(overId)) {
      const oldIndex = othersIds.indexOf(activeId);
      const newIndex = othersIds.indexOf(overId);
      const reordered = arrayMove(othersProjects, oldIndex, newIndex);
      const newOrder = [...myProjects.map(p => p.id), ...reordered.map(p => p.id)];
      saveOrder(newOrder);
    }

    // Single section (no split)
    if (!splitSections) {
      const allIds = sortedProjects.map(p => p.id);
      if (allIds.includes(activeId) && allIds.includes(overId)) {
        const oldIndex = allIds.indexOf(activeId);
        const newIndex = allIds.indexOf(overId);
        const reordered = arrayMove(sortedProjects, oldIndex, newIndex);
        saveOrder(reordered.map(p => p.id));
      }
    }
  };

  const activeProject = activeDragId ? projects.find(p => p.id === activeDragId) : null;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>Project Bridge</h1>
          <span style={styles.subtitle}>AI-powered prototype generator</span>
        </div>
        <div style={styles.headerRight}>
          <ThemeToggle />
          <button type="button" style={styles.settingsBtn} onClick={() => navigate('/settings')} title="設定" data-testid="settings-btn">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="10" cy="10" r="3" />
              <path d="M10 1v2M10 17v2M1 10h2M17 10h2M3.93 3.93l1.41 1.41M14.66 14.66l1.41 1.41M3.93 16.07l1.41-1.41M14.66 5.34l1.41-1.41" />
            </svg>
          </button>
          <button type="button" style={styles.globalDesignBtn} onClick={() => navigate('/global-design')} data-testid="global-design-btn">
            🌐 全域設計
          </button>
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}
                data-testid="home-user-name">
                👤 {user.name}{user.role === 'admin' && <span style={{ fontSize: 10, color: 'var(--accent)', marginLeft: 4 }}>管理員</span>}
              </span>
              <button type="button"
                onClick={logout}
                style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none', border: '1px solid var(--border-primary)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}
                data-testid="home-logout-btn">
                登出
              </button>
            </div>
          ) : (
            <button type="button"
              onClick={handleLogin}
              style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: '1px solid var(--accent)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 500 }}
              data-testid="home-login-btn">
              👤 登入
            </button>
          )}
          <button type="button" style={styles.newBtn} onClick={handleNewProject} data-testid="new-project-btn">
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
              onChange={e => setSortBy(e.target.value as 'newest' | 'oldest' | 'name' | 'custom')}
              style={styles.sortSelect}
              data-testid="sort-select"
              title="排序方式"
            >
              <option value="custom">自訂排序</option>
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

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {splitSections ? (
            <>
              <h2 style={styles.sectionHeading}>我的專案</h2>
              <SortableProjectGrid
                projects={myProjects}
                navigate={navigate}
                user={user}
                handleDelete={handleDelete}
                handleFork={handleFork}
                own
                isDraggable={isCustomSort && !!user}
              />
              <h2 style={styles.sectionHeadingSecond}>其他人的專案</h2>
              <SortableProjectGrid
                projects={othersProjects}
                navigate={navigate}
                user={user}
                handleDelete={handleDelete}
                handleFork={handleFork}
                own={false}
                isDraggable={isCustomSort && !!user}
              />
            </>
          ) : (
            <SortableProjectGrid
              projects={sortedProjects}
              navigate={navigate}
              user={user}
              handleDelete={handleDelete}
              handleFork={handleFork}
              own
              isDraggable={isCustomSort && !!user}
            />
          )}

          <DragOverlay>
            {activeProject ? (
              <div style={{ ...styles.card, ...styles.cardDragOverlay }}>
                <div style={styles.cardContent}>
                  <h3 style={styles.cardTitle}>{activeProject.name}</h3>
                  {activeProject.owner_name && (
                    <p style={styles.cardOwner}>{activeProject.owner_name}</p>
                  )}
                  <p style={styles.cardDate}>更新於 {relativeTime(activeProject.updated_at)}</p>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>

      {showNewProject && (
        <NewProjectDialog
          onClose={() => setShowNewProject(false)}
          onCreated={handleProjectCreated}
        />
      )}

      {deleteTarget && (
        <div style={styles.modalOverlay} onClick={() => setDeleteTarget(null)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px', color: '#dc2626' }}>刪除專案</h3>
            <p style={{ margin: '0 0 16px', color: 'var(--text-secondary)', fontSize: 14 }}>
              此操作無法復原。請輸入 <strong style={{ color: 'var(--text-primary)' }}>{deleteTarget.name}</strong> 以確認刪除。
            </p>
            <input
              type="text"
              value={deleteInput}
              onChange={e => setDeleteInput(e.target.value)}
              placeholder={deleteTarget.name}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-primary)', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' }}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') confirmDelete(); }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setDeleteTarget(null)} style={{ padding: '8px 16px', border: '1px solid var(--border-primary)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}>取消</button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleteInput !== deleteTarget.name}
                style={{ padding: '8px 16px', border: 'none', borderRadius: 6, background: deleteInput === deleteTarget.name ? '#dc2626' : '#fca5a5', color: '#fff', cursor: deleteInput === deleteTarget.name ? 'pointer' : 'not-allowed', fontWeight: 600 }}
              >
                刪除此專案
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface SortableProjectGridProps {
  projects: Project[];
  navigate: (path: string) => void;
  user: { id: string; role: string } | null;
  handleDelete: (e: React.MouseEvent, id: string) => void;
  handleFork: (e: React.MouseEvent, id: string) => void;
  own: boolean;
  isDraggable: boolean;
}

function SortableProjectGrid({ projects, navigate, user, handleDelete, handleFork, own, isDraggable }: SortableProjectGridProps) {
  return (
    <SortableContext items={projects.map(p => p.id)} strategy={rectSortingStrategy}>
      <div style={styles.grid}>
        {projects.map(project => (
          <SortableProjectCard
            key={project.id}
            project={project}
            navigate={navigate}
            user={user}
            handleDelete={handleDelete}
            handleFork={handleFork}
            own={own}
            isDraggable={isDraggable}
          />
        ))}
      </div>
    </SortableContext>
  );
}

interface SortableProjectCardProps {
  project: Project;
  navigate: (path: string) => void;
  user: { id: string; role: string } | null;
  handleDelete: (e: React.MouseEvent, id: string) => void;
  handleFork: (e: React.MouseEvent, id: string) => void;
  own: boolean;
  isDraggable: boolean;
}

function SortableProjectCard({ project, navigate, user, handleDelete, handleFork, own, isDraggable }: SortableProjectCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id, disabled: !isDraggable });

  const style: React.CSSProperties = {
    ...styles.card,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    cursor: isDraggable ? 'grab' : 'pointer',
    ...(isDragging ? { zIndex: 10 } : {}),
  };

  const canDelete = user?.id === project.owner_id || user?.role === 'admin' || project.owner_id == null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(isDraggable ? listeners : {})}
      data-testid={`project-card-${project.id}`}
      onClick={() => {
        if (!isDragging) navigate(`/project/${project.id}`);
      }}
      onMouseEnter={e => {
        if (!isDragging) {
          (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)';
          (e.currentTarget as HTMLDivElement).style.borderColor = '#3b82f6';
        }
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-sm)';
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-primary)';
      }}
    >
      <div style={styles.cardContent}>
        <h3 style={styles.cardTitle}>{project.name}</h3>
        {project.owner_name && (
          <p style={styles.cardOwner}>{project.owner_name}</p>
        )}
        <p style={styles.cardDate}>更新於 {relativeTime(project.updated_at)}</p>
      </div>
      {!own && (
        <button
          type="button"
          style={styles.forkBtn}
          onClick={e => handleFork(e, project.id)}
          title="Fork 專案"
          data-testid={`fork-project-${project.id}`}
        >
          Fork
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          style={styles.deleteBtn}
          onClick={e => handleDelete(e, project.id)}
          title="刪除專案"
          data-testid={`delete-project-${project.id}`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4M12.67 4v9.33a1.33 1.33 0 01-1.34 1.34H4.67a1.33 1.33 0 01-1.34-1.34V4" />
          </svg>
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalContent: { background: 'var(--bg-card)', borderRadius: 12, padding: 24, width: 420, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', color: 'var(--text-primary)' },
  container: {
    minHeight: '100vh',
    backgroundColor: 'var(--bg-primary)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: 'var(--text-primary)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 32px',
    backgroundColor: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border-primary)',
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
    color: 'var(--text-primary)',
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
  },
  settingsBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    border: '1px solid var(--border-primary)',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
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
    color: 'var(--text-secondary)',
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
    color: 'var(--text-secondary)',
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
    border: '1px solid var(--border-primary)',
    borderRadius: '8px',
    fontSize: '14px',
    color: 'var(--text-primary)',
    backgroundColor: 'var(--bg-input)',
    outline: 'none',
  },
  sortSelect: {
    padding: '8px 12px',
    border: '1px solid var(--border-primary)',
    borderRadius: '8px',
    fontSize: '14px',
    color: 'var(--text-primary)',
    backgroundColor: 'var(--bg-input)',
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
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-primary)',
    borderRadius: '12px',
    cursor: 'pointer',
    boxShadow: 'var(--shadow-sm)',
    transition: 'box-shadow 0.15s, border-color 0.15s, transform 0.15s, opacity 0.15s',
  },
  cardDragOverlay: {
    boxShadow: 'var(--shadow-md)',
    transform: 'scale(1.03)',
    cursor: 'grabbing',
    opacity: 1,
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    margin: '0 0 4px',
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  cardOwner: {
    margin: '0 0 2px',
    fontSize: '12px',
    color: 'var(--text-secondary)',
  },
  cardDate: {
    margin: 0,
    fontSize: '13px',
    color: 'var(--text-muted)',
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
    color: 'var(--text-muted)',
    cursor: 'pointer',
    flexShrink: 0,
    marginLeft: '8px',
  },
  sectionHeading: {
    margin: '0 0 16px',
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  sectionHeadingSecond: {
    margin: '32px 0 16px',
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  forkBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '32px',
    padding: '0 10px',
    border: '1px solid var(--border-primary)',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    flexShrink: 0,
    marginLeft: '8px',
    fontSize: '12px',
    fontWeight: 500,
  },
};
