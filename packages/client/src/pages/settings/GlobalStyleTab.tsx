import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface GlobalDesign {
  tokens: string;
  convention: string;
  description: string;
}

interface AnalyzeResult {
  description: string;
  convention: string;
  tokens: {
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
    fontFamily: string;
    borderRadius: string;
  };
  palette: string[];
  crawledUrls: string[];
  failedUrls: { url: string; error?: string }[];
}

/** 全域風格 — global design style editable by every user (not admin-gated).
 *  Projects inherit this via the per-project「繼承全域風格」toggle. */
export default function GlobalStyleTab() {
  const [data, setData] = useState<GlobalDesign>({ tokens: '', convention: '', description: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // URL analysis
  const [urls, setUrls] = useState<string[]>(['']);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [palette, setPalette] = useState<string[]>([]);

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

  const handleAnalyze = async () => {
    const valid = urls.map(u => u.trim()).filter(u => /^https?:\/\//i.test(u));
    if (valid.length === 0) {
      setAnalyzeError('請輸入至少一個 http/https 網址');
      return;
    }
    setAnalyzing(true);
    setAnalyzeError(null);
    setPalette([]);
    try {
      const r = await api<AnalyzeResult>('/api/design-presets/analyze-url', {
        method: 'POST',
        body: JSON.stringify({ urls: valid }),
      });
      // Autofill the global style fields from AI analysis; user reviews then saves.
      const tokenLines = [
        r.tokens.primaryColor && `--primary: ${r.tokens.primaryColor};`,
        r.tokens.secondaryColor && `--secondary: ${r.tokens.secondaryColor};`,
        r.tokens.backgroundColor && `--background: ${r.tokens.backgroundColor};`,
        r.tokens.fontFamily && `--font-family: ${r.tokens.fontFamily};`,
        r.tokens.borderRadius && `--border-radius: ${r.tokens.borderRadius};`,
      ].filter(Boolean).join('\n');
      setData({
        description: r.description || data.description,
        convention: r.convention || data.convention,
        tokens: tokenLines || data.tokens,
      });
      setPalette(r.palette);
      if (r.failedUrls.length > 0) {
        setAnalyzeError(`部分網址失敗：${r.failedUrls.map(f => f.url).join(', ')}`);
      }
      setMsg('AI 分析完成 — 請確認內容後按「儲存設定」');
    } catch (e) {
      setAnalyzeError(`分析失敗：${(e as Error).message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) return <p className="settings-muted">載入中…</p>;

  return (
    <div className="settings-sections">

      <section className="settings-section">
        <header className="settings-section__head">
          <h2 className="settings-section__title">參考網站風格分析</h2>
        </header>
        <p className="settings-muted">
          貼上喜歡的網站網址（最多 3 個），AI 會爬取網站取得真實樣式，自動產出設計語言描述、設計規範與配色 tokens。
        </p>
        {urls.map((u, i) => (
          <div className="setting-row" key={i}>
            <label>{`參考網址 ${i + 1}`}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="url"
                value={u}
                placeholder="https://example.com"
                onChange={e => setUrls(prev => prev.map((p, j) => (j === i ? e.target.value : p)))}
                style={{ flex: 1 }}
              />
              {urls.length > 1 && (
                <button className="settings-btn" onClick={() => setUrls(prev => prev.filter((_, j) => j !== i))}>✕</button>
              )}
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          {urls.length < 3 && (
            <button className="settings-btn" onClick={() => setUrls(prev => [...prev, ''])}>＋ 新增網址</button>
          )}
          <button
            className="settings-btn settings-btn--primary"
            onClick={handleAnalyze}
            disabled={analyzing}
          >
            {analyzing ? 'AI 分析中（爬取網站可能需要 1-2 分鐘）…' : '🔍 AI 分析風格'}
          </button>
          {analyzeError && <span className="settings-error" style={{ fontSize: 12 }}>{analyzeError}</span>}
        </div>
        {palette.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' }}>
            <span className="settings-muted" style={{ fontSize: 12 }}>取得配色：</span>
            {palette.map((c, i) => (
              <span
                key={i}
                title={c}
                style={{ width: 22, height: 22, borderRadius: 5, background: c, border: '1px solid var(--border-primary)', display: 'inline-block' }}
              />
            ))}
          </div>
        )}
      </section>

      <section className="settings-section">
        <header className="settings-section__head">
          <h2 className="settings-section__title">設計方向</h2>
        </header>
        <p className="settings-muted">描述整體設計風格與理念。設計模式生成時，開啟「繼承全域風格」的專案會套用。</p>
        <div className="setting-row">
          <label>設計描述</label>
          <textarea
            value={data.description}
            onChange={e => setData(d => ({ ...d, description: e.target.value }))}
            rows={5}
            placeholder="例：面向年輕族群的電商平台，簡潔現代，強調清晰的資訊層次。"
          />
        </div>
        <div className="setting-row">
          <label>設計規範（約束條件）</label>
          <textarea
            value={data.convention}
            onChange={e => setData(d => ({ ...d, convention: e.target.value }))}
            rows={5}
            placeholder={'例：\n- 主色調：紫色系 (#7c5cbf)\n- 圓角：12px\n- 字型：Noto Sans TC'}
          />
        </div>
      </section>

      <section className="settings-section">
        <header className="settings-section__head">
          <h2 className="settings-section__title">CSS Tokens</h2>
        </header>
        <div className="setting-row">
          <label>CSS 變數（每行一條）</label>
          <textarea
            value={data.tokens}
            onChange={e => setData(d => ({ ...d, tokens: e.target.value }))}
            rows={8}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
            placeholder={'--primary: #7c5cbf;\n--border-radius: 12px;'}
          />
        </div>
      </section>

      <section className="settings-section">
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <button className="settings-btn settings-btn--primary" onClick={handleSave} disabled={saving}>
            {saving ? '儲存中…' : '儲存設定'}
          </button>
          {msg && (
            <span style={{ fontSize: 12 }} className={msg.includes('失敗') ? 'settings-error' : 'settings-success'}>
              {msg}
            </span>
          )}
        </div>
      </section>

    </div>
  );
}
