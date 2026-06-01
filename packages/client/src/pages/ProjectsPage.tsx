import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectsStore } from '../stores/useProjectsStore';
import { useAuthStore } from '../stores/useAuthStore';
import { getToken } from '../lib/api';

export default function ProjectsPage() {
  const { projects, list, create } = useProjectsStore();
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [name, setName] = useState('');

  useEffect(() => { void list(); }, [list]);

  const downloadBackup = async (project: { id: string; name: string }) => {
    const token = getToken();
    const res = await fetch(`/api/projects/${project.id}/backup`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
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
        <button onClick={() => void logout()} style={ghostBtn}>登出</button>
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
const ghostBtn: CSSProperties = { padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' };
const backupBtn: CSSProperties = { padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0 };
