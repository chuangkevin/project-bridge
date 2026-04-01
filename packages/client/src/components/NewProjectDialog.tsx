import { useState, useRef, useEffect } from 'react';
import { authHeaders } from '../contexts/AuthContext';

interface Props {
  onClose: () => void;
  onCreated: (project: { id: string; name: string; share_token: string; created_at: string; updated_at: string }) => void;
}

type ProjectMode = 'design' | 'consultant' | 'architecture';

export default function NewProjectDialog({ onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<ProjectMode>('design');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Design presets (Task 5)
  const [presets, setPresets] = useState<any[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string>('');

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    fetch('/api/design-presets').then(r => r.json()).then(setPresets).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name: name.trim(), mode, design_preset_id: selectedPreset || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create project');
      }
      const project = await res.json();
      onCreated(project);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
      setSubmitting(false);
    }
  };

  const modeCardStyle = (selected: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '14px 12px',
    border: selected ? '2px solid var(--accent)' : '2px solid var(--border-primary)',
    borderRadius: '10px',
    backgroundColor: selected ? 'var(--accent-light)' : 'var(--bg-card)',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.15s ease',
  });

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.dialog} onClick={e => e.stopPropagation()}>
        <h2 style={styles.title}>新增專案</h2>
        <form onSubmit={handleSubmit}>
          <label style={styles.label}>建立模式</label>
          <div style={styles.modeRow}>
            {([
              { id: 'design' as const, icon: '🎨', label: '設計', desc: '描述你想要的 UI，AI 團隊討論後自動生成互動原型' },
              { id: 'consultant' as const, icon: '💬', label: '顧問', desc: '跟 AI 架構師對話，釐清需求、分析業務邏輯、評估技術方案' },
              { id: 'architecture' as const, icon: '🔗', label: '架構', desc: '視覺化規劃頁面結構與導航流程，完成後可直接生成原型' },
            ]).map(m => (
              <button
                key={m.id}
                type="button"
                style={modeCardStyle(mode === m.id)}
                onClick={() => setMode(m.id)}
                data-testid={`mode-${m.id}`}
              >
                <div style={{ fontSize: '24px', textAlign: 'center' as const }}>{m.icon}</div>
                <div style={{ ...styles.modeTitle, textAlign: 'center' as const, marginTop: '4px' }}>{m.label}</div>
              </button>
            ))}
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', minHeight: '36px', margin: '4px 0 0' }}>
            {({ design: '描述你想要的 UI，AI 團隊討論後自動生成互動原型', consultant: '跟 AI 架構師對話，釐清需求、分析業務邏輯、評估技術方案', architecture: '視覺化規劃頁面結構與導航流程，完成後可直接生成原型' })[mode]}
          </p>

          {presets.length > 0 && (
            <div style={{ marginBottom: 16, marginTop: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>設計風格</label>
              <select value={selectedPreset} onChange={e => setSelectedPreset(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', boxSizing: 'border-box' as const }}>
                <option value="">使用預設風格</option>
                {presets.map(p => (
                  <option key={p.id} value={p.id}>{p.name} {p.is_default ? '⭐' : ''}</option>
                ))}
              </select>
            </div>
          )}

          <label style={{ ...styles.label, marginTop: '16px' }}>專案名稱</label>
          <input
            ref={inputRef}
            style={styles.input}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="我的原型專案"
            disabled={submitting}
          />
          {error && <p style={styles.error}>{error}</p>}
          <div style={styles.actions}>
            <button type="button" style={styles.cancelBtn} onClick={onClose} disabled={submitting}>
              取消
            </button>
            <button type="submit" style={styles.createBtn} disabled={submitting || !name.trim()} data-testid="create-project-btn">
              {submitting ? '建立中...' : '建立'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  dialog: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: '12px',
    padding: '24px',
    width: '440px',
    maxWidth: '90vw',
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
  },
  title: {
    margin: '0 0 20px',
    fontSize: '18px',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    marginBottom: '6px',
  },
  modeRow: {
    display: 'flex',
    gap: '10px',
    marginBottom: '4px',
  },
  modeTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: '4px',
  },
  modeIcon: {
    fontSize: '15px',
  },
  modeDesc: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    lineHeight: '1.4',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid var(--border-primary)',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box' as const,
    backgroundColor: 'var(--bg-input)',
    color: 'var(--text-primary)',
  },
  error: {
    color: '#ef4444',
    fontSize: '13px',
    margin: '8px 0 0',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '20px',
  },
  cancelBtn: {
    padding: '8px 16px',
    border: '1px solid var(--border-primary)',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    fontSize: '14px',
    cursor: 'pointer',
  },
  createBtn: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: 'var(--accent)',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
