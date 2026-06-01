import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectsStore } from '../stores/useProjectsStore';
import { useAuthStore } from '../stores/useAuthStore';

export default function ProjectsPage() {
  const { projects, list, create } = useProjectsStore();
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [name, setName] = useState('');

  useEffect(() => { void list(); }, [list]);

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
            style={{ padding: 14, background: 'var(--bg-card)', borderRadius: 8, cursor: 'pointer' }}
            onClick={() => navigate(`/projects/${p.id}`)}
          >
            <strong>{p.name}</strong>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.id}</div>
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
