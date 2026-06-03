import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface DesignPreset {
  id: string;
  name: string;
  description: string;
  tokens: {
    primaryColor: string;
    fontFamily: string;
    borderRadius: string;
  };
  referenceUrls: string[];
  createdAt: string;
}

const EMPTY_PRESET: Omit<DesignPreset, 'id' | 'createdAt'> = {
  name: '',
  description: '',
  tokens: { primaryColor: '#7c5cbf', fontFamily: '', borderRadius: '' },
  referenceUrls: [],
};

export default function PresetsTab() {
  const [presets, setPresets] = useState<DesignPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_PRESET, tokens: { ...EMPTY_PRESET.tokens } });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await api<{ presets: DesignPreset[] }>('/api/design-presets');
      setPresets(r.presets);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const openNew = () => {
    setEditingId(null);
    setForm({ ...EMPTY_PRESET, tokens: { ...EMPTY_PRESET.tokens } });
    setShowForm(true);
    setFeedback(null);
  };

  const openEdit = (p: DesignPreset) => {
    setEditingId(p.id);
    setForm({ name: p.name, description: p.description, tokens: { ...p.tokens }, referenceUrls: p.referenceUrls });
    setShowForm(true);
    setFeedback(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setFeedback('名稱不能為空'); return; }
    setSaving(true);
    setFeedback(null);
    try {
      if (editingId) {
        await api(`/api/design-presets/${editingId}`, { method: 'PUT', body: JSON.stringify(form) });
        setFeedback('已更新');
      } else {
        await api('/api/design-presets', { method: 'POST', body: JSON.stringify(form) });
        setFeedback('已新增');
      }
      await refresh();
      setTimeout(() => { setShowForm(false); setFeedback(null); }, 800);
    } catch (e) {
      setFeedback(`儲存失敗：${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`確定刪除預設「${name}」？`)) return;
    try {
      await api(`/api/design-presets/${id}`, { method: 'DELETE' });
      await refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleCopy = async (id: string) => {
    try {
      await api(`/api/design-presets/${id}/copy`, { method: 'POST' });
      await refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div className="settings-sections">
      <section className="settings-section">
        <header className="settings-section__head">
          <h2 className="settings-section__title">設計預設</h2>
          <span className="settings-section__badge">{presets.length} 個</span>
        </header>
        <p className="settings-muted">儲存常用的設計風格組合，快速套用到新專案的 AI 生成。</p>

        {error && <p className="settings-error">{error}</p>}
        {loading ? (
          <p className="settings-muted">載入中…</p>
        ) : (
          <>
            {presets.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 'var(--space-4)' }}>
                {presets.map(p => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      background: 'var(--bg-elevated)',
                      borderRadius: 8,
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {/* Color dot */}
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: p.tokens.primaryColor,
                        border: '2px solid var(--border-primary)',
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                      {p.description && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.description}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {p.tokens.primaryColor}
                        {p.tokens.fontFamily ? ` · ${p.tokens.fontFamily}` : ''}
                        {p.tokens.borderRadius ? ` · r${p.tokens.borderRadius}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button className="settings-btn" onClick={() => openEdit(p)}>編輯</button>
                      <button className="settings-btn" onClick={() => handleCopy(p.id)} title="複製">複製</button>
                      <button className="settings-btn settings-btn--danger" onClick={() => handleDelete(p.id, p.name)}>刪除</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!showForm ? (
              <button className="settings-btn settings-btn--primary" onClick={openNew}>＋ 新增預設</button>
            ) : (
              <div style={{
                padding: 16,
                background: 'var(--bg-card)',
                borderRadius: 8,
                border: '1px solid var(--border-primary)',
                marginTop: 'var(--space-3)',
              }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>
                  {editingId ? '編輯預設' : '新增預設'}
                </h3>
                <div className="setting-row">
                  <label>名稱 *</label>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="例：紫色現代風"
                  />
                </div>
                <div className="setting-row">
                  <label>描述</label>
                  <input
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="簡短描述設計風格"
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  <div className="setting-row">
                    <label>主色調</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="color"
                        value={form.tokens.primaryColor}
                        onChange={e => setForm(f => ({ ...f, tokens: { ...f.tokens, primaryColor: e.target.value } }))}
                        style={{ width: 40, height: 32, padding: 2, border: '1px solid var(--border-primary)', borderRadius: 4, cursor: 'pointer', background: 'transparent' }}
                      />
                      <input
                        value={form.tokens.primaryColor}
                        onChange={e => setForm(f => ({ ...f, tokens: { ...f.tokens, primaryColor: e.target.value } }))}
                        placeholder="#7c5cbf"
                        style={{ flex: 1 }}
                      />
                    </div>
                  </div>
                  <div className="setting-row">
                    <label>字型</label>
                    <input
                      value={form.tokens.fontFamily}
                      onChange={e => setForm(f => ({ ...f, tokens: { ...f.tokens, fontFamily: e.target.value } }))}
                      placeholder="例：Noto Sans TC"
                    />
                  </div>
                  <div className="setting-row">
                    <label>圓角</label>
                    <input
                      value={form.tokens.borderRadius}
                      onChange={e => setForm(f => ({ ...f, tokens: { ...f.tokens, borderRadius: e.target.value } }))}
                      placeholder="例：12px"
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 'var(--space-3)', alignItems: 'center' }}>
                  <button className="settings-btn settings-btn--primary" onClick={handleSave} disabled={saving}>
                    {saving ? '儲存中…' : '儲存'}
                  </button>
                  <button className="settings-btn" onClick={() => { setShowForm(false); setFeedback(null); }}>取消</button>
                  {feedback && (
                    <span className={feedback.includes('失敗') || feedback === '名稱不能為空' ? 'settings-error' : 'settings-success'} style={{ fontSize: 12 }}>
                      {feedback}
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
