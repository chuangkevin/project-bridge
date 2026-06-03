import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

interface GlobalDesign {
  tokens: string;
  convention: string;
  description: string;
}

export default function GlobalDesignPage() {
  const [data, setData] = useState<GlobalDesign>({ tokens: '', convention: '', description: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api<GlobalDesign>('/api/global-design')
      .then(setData)
      .catch(() => setMsg('載入失敗'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api('/api/global-design', { method: 'PUT', body: JSON.stringify(data) });
      setMsg('已儲存');
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setMsg(`儲存失敗：${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleResetConvention = async () => {
    if (!confirm('確定要重設設計規範嗎？')) return;
    try {
      await api('/api/global-design/reset-convention', { method: 'POST' });
      setData(d => ({ ...d, convention: '' }));
      setMsg('規範已重設');
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setMsg(`重設失敗：${(e as Error).message}`);
    }
  };

  if (loading) {
    return (
      <div className="settings">
        <header className="settings__header">
          <Link to="/projects" style={{ color: 'var(--text-muted)', fontSize: 13 }}>← 專案</Link>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>全域設計</h1>
        </header>
        <div className="settings__body"><p className="settings-muted">載入中…</p></div>
      </div>
    );
  }

  return (
    <div className="settings">
      <header className="settings__header">
        <Link to="/projects" style={{ color: 'var(--text-muted)', fontSize: 13 }}>← 專案</Link>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>全域設計</h1>
      </header>

      <div className="settings__body">
        <div className="settings-sections">

          <section className="settings-section">
            <header className="settings-section__head">
              <h2 className="settings-section__title">設計說明</h2>
            </header>
            <p className="settings-muted">描述此專案的設計風格、目標使用者與整體設計理念。AI 生成時會參考此說明。</p>
            <div className="setting-row">
              <label>設計描述 / 規範</label>
              <textarea
                value={data.description}
                onChange={e => setData(d => ({ ...d, description: e.target.value }))}
                rows={5}
                placeholder="例：這是一個面向年輕族群的電商平台，採用簡潔現代的設計風格，強調清晰的資訊層次與流暢的操作體驗。"
              />
            </div>
            <div className="setting-row">
              <label>設計規範（約束條件）</label>
              <textarea
                value={data.convention}
                onChange={e => setData(d => ({ ...d, convention: e.target.value }))}
                rows={5}
                placeholder="例：&#10;- 主色調：紫色系 (#7c5cbf)&#10;- 圓角：12px&#10;- 字型：Noto Sans TC&#10;- 不使用純黑背景"
              />
            </div>
          </section>

          <section className="settings-section">
            <header className="settings-section__head">
              <h2 className="settings-section__title">CSS 自訂屬性</h2>
            </header>
            <p className="settings-muted">定義全域 CSS 變數，生成的 UI 原型將套用這些設計 token。</p>
            <div className="setting-row">
              <label>CSS 變數（每行一條）</label>
              <textarea
                value={data.tokens}
                onChange={e => setData(d => ({ ...d, tokens: e.target.value }))}
                rows={8}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
                placeholder="--primary: #7c5cbf;&#10;--secondary: #a78bfa;&#10;--bg-dark: #0f0a1e;&#10;--font-size-base: 16px;&#10;--border-radius: 12px;"
              />
            </div>
          </section>

          <section className="settings-section">
            <header className="settings-section__head">
              <h2 className="settings-section__title">操作</h2>
            </header>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                className="settings-btn settings-btn--primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? '儲存中…' : '儲存設定'}
              </button>
              <button
                className="settings-btn settings-btn--danger"
                onClick={handleResetConvention}
              >
                重設規範
              </button>
              {msg && (
                <span
                  style={{ fontSize: 12 }}
                  className={msg.includes('失敗') ? 'settings-error' : 'settings-success'}
                >
                  {msg}
                </span>
              )}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
