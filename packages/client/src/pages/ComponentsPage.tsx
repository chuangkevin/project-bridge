import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

interface LibComponent {
  id: string;
  projectId: string | null;
  name: string;
  category: string;
  description: string;
  html: string;
  css: string;
  tags: string[];
  version: number;
  updatedAt: string;
}

interface ComponentVersion { version: number; html: string; css: string; createdAt: string }

/** Minimal standalone preview document for a component snippet. */
function previewDoc(c: LibComponent): string {
  return `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8" />
<script src="https://cdn.tailwindcss.com"></script>
<style>body{margin:16px;font-family:-apple-system,"PingFang TC","Microsoft JhengHei",sans-serif;}${c.css}</style>
</head><body>${c.html}</body></html>`;
}

export default function ComponentsPage() {
  const [components, setComponents] = useState<LibComponent[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<LibComponent | null>(null);
  const [versions, setVersions] = useState<ComponentVersion[] | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await api<{ components: LibComponent[] }>('/api/components');
      setComponents(r.components);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    setVersions(null);
    if (!selected) return;
    api<{ versions: ComponentVersion[] }>(`/api/components/${selected.id}/versions`)
      .then(r => setVersions(r.versions))
      .catch(() => setVersions([]));
  }, [selected?.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return components;
    return components.filter(c =>
      c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.category.includes(q));
  }, [components, search]);

  const remove = async (c: LibComponent) => {
    if (!confirm(`刪除元件「${c.name}」？這無法復原。`)) return;
    await api(`/api/components/${c.id}`, { method: 'DELETE' });
    if (selected?.id === c.id) setSelected(null);
    await refresh();
  };

  return (
    <div className="components-page" style={{ padding: 'var(--space-4)', height: '100vh', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', boxSizing: 'border-box' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <Link to="/projects" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: 13 }}>← 專案</Link>
        <h1 style={{ fontSize: 18, margin: 0 }}>元件庫</h1>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{components.length} 個元件 · AI 生成時會原樣重用這些元件，不再重新發揮</span>
        <input
          value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋名稱 / 描述…"
          style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13, width: 240 }}
        />
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '320px 1fr' : '1fr', gap: 'var(--space-3)', flex: 1, minHeight: 0 }}>
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {loading && <p style={{ color: 'var(--text-muted)' }}>載入中…</p>}
          {!loading && filtered.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              還沒有元件。到設計頁按「📦 存元素為元件」，把精雕後的區塊沉澱進來。
            </p>
          )}
          {filtered.map(c => (
            <button key={c.id} onClick={() => setSelected(c)}
              style={{
                textAlign: 'left', padding: 'var(--space-3)', borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${selected?.id === c.id ? 'var(--accent)' : 'var(--border-subtle)'}`,
                background: 'var(--bg-card)', color: 'var(--text-primary)',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: 13, fontFamily: 'monospace' }}>{c.name}</strong>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>v{c.version}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{c.projectId ? '專案' : '全域'}</span>
              </div>
              {c.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{c.description}</div>}
            </button>
          ))}
        </div>

        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <h2 style={{ fontSize: 15, margin: 0, fontFamily: 'monospace' }}>{selected.name}</h2>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>v{selected.version}</span>
              {versions && versions.length > 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>（歷史版本 {versions.map(v => `v${v.version}`).join(', ')}）</span>
              )}
              <button onClick={() => void remove(selected)}
                style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: '#ef4444', fontSize: 12, cursor: 'pointer' }}>
                刪除
              </button>
              <button onClick={() => setSelected(null)}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
                關閉
              </button>
            </div>
            <iframe title="元件預覽" srcDoc={previewDoc(selected)} sandbox="allow-scripts"
              style={{ flex: 1, minHeight: 200, border: '1px solid var(--border-subtle)', borderRadius: 10, background: 'white' }} />
            <details>
              <summary style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>原始碼</summary>
              <pre style={{ fontSize: 11, background: 'var(--bg-elevated)', padding: 'var(--space-3)', borderRadius: 8, overflowX: 'auto', maxHeight: 240 }}>
                {selected.html}{selected.css ? `\n\n/* style */\n${selected.css}` : ''}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
