import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useProjectsStore } from '../stores/useProjectsStore';

export default function ProjectsPage() {
  const { projects, list, create } = useProjectsStore();
  const navigate = useNavigate();
  const [name, setName] = useState('');

  useEffect(() => { void list(); }, [list]);

  const downloadBackup = async (project: { id: string; name: string }) => {
    const res = await fetch(`/api/projects/${project.id}/backup`);
    if (!res.ok) {
      alert('備份失敗：' + res.status);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `designbridge-${project.name}-${new Date().toISOString().slice(0, 10)}.tar.gz`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await create(name.trim());
    setName('');
  };

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>專案</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link
            to="/global-design"
            style={{ ...iconBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, padding: '6px 12px' }}
            title="全域設計設定"
          >
            🌐 全域設計
          </Link>
          <button
            onClick={() => navigate('/settings')}
            style={iconBtn}
            aria-label="設定"
            title="設定"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>
      <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input placeholder="新專案名稱" value={name} onChange={(e) => setName(e.target.value)} style={input} />
        <button type="submit" style={btn}>建立</button>
      </form>
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {projects.map((p) => (
          <li
            key={p.id}
            style={{ padding: 14, background: 'var(--bg-card)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
          >
            <div style={{ flex: 1, cursor: 'pointer', minWidth: 0 }} onClick={() => navigate(`/projects/${p.id}`)}>
              <strong>{p.name}</strong>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.id}</div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); void downloadBackup(p); }}
              style={backupBtn}
              title="下載備份 (.tar.gz)"
            >
              下載備份
            </button>
          </li>
        ))}
        {projects.length === 0 && <li style={{ color: 'var(--text-muted)' }}>尚無專案</li>}
      </ul>
    </div>
  );
}

const input: CSSProperties = { flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-input)', color: 'var(--text-primary)' };
const btn: CSSProperties = { padding: '10px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))', color: '#fff', cursor: 'pointer', fontWeight: 600 };
const iconBtn: CSSProperties = { padding: 8, borderRadius: 8, border: '1px solid var(--border-primary)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
const backupBtn: CSSProperties = { padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0 };
