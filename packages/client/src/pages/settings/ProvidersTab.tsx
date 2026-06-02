import { useEffect, useMemo, useState } from 'react';
import { useApiKeys } from '../../hooks/useApiKeys';
import { useOpencodeServers, type OpencodeTestResult, type OpencodeModel } from '../../hooks/useOpencodeServers';
import { apiAdmin as api } from '../../lib/api';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function ApiKeysSection() {
  const { keys, loading, error, add, addBatch, remove } = useApiKeys();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const detectedCount = useMemo(
    () => draft.split(/\r?\n/).map(l => l.trim()).filter(l => /^AIza[A-Za-z0-9_-]{30,}$/.test(l)).length,
    [draft],
  );

  const handleImport = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      if (detectedCount > 1) {
        const r = await addBatch(draft);
        setFeedback(`已新增 ${r.added} 把，跳過 ${r.skipped} 行`);
      } else {
        await add(draft.trim());
        setFeedback('已新增 1 把');
      }
      setDraft('');
    } catch (e) {
      setFeedback(`匯入失敗：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (suffix: string, fromEnv: boolean) => {
    if (fromEnv) {
      alert('此 key 來自環境變數，無法從 UI 刪除');
      return;
    }
    if (!confirm(`確定刪除結尾為 ...${suffix} 的 API key？`)) return;
    try { await remove(suffix); } catch (e) { alert((e as Error).message); }
  };

  return (
    <section className="settings-section">
      <header className="settings-section__head">
        <h2 className="settings-section__title">Gemini API Keys</h2>
        <span className="settings-section__badge">{keys.length} 把</span>
      </header>
      {error && <p className="settings-error">{error}</p>}
      {loading ? <p className="settings-muted">載入中…</p> : (
        <>
          {keys.length > 0 && (
            <div className="settings-table-wrap">
              <table className="settings-table">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th className="settings-table__num">今日呼叫</th>
                    <th className="settings-table__num">今日 tokens</th>
                    <th className="settings-table__num">總呼叫</th>
                    <th className="settings-table__num">總 tokens</th>
                    <th className="settings-table__actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map(k => (
                    <tr key={k.suffix}>
                      <td><code className="settings-key-suffix">...{k.suffix}</code>{k.fromEnv && <span className="settings-env-badge" title="來自環境變數">ENV</span>}</td>
                      <td className="settings-table__num">{k.today.calls}</td>
                      <td className="settings-table__num">{formatTokens(k.today.tokens)}</td>
                      <td className="settings-table__num">{k.total.calls}</td>
                      <td className="settings-table__num">{formatTokens(k.total.tokens)}</td>
                      <td className="settings-table__actions">
                        <button
                          className="settings-btn settings-btn--danger"
                          onClick={() => handleDelete(k.suffix, k.fromEnv)}
                          disabled={k.fromEnv}
                          title={k.fromEnv ? '此 key 來自 env，無法刪除' : '刪除此 key'}
                        >刪除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="setting-row" style={{ marginTop: 'var(--space-4)' }}>
            <label>新增 API key（支援多行批次貼上）</label>
            <textarea
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setFeedback(null); }}
              placeholder={'AIzaSy...\nAIzaSy...\n（一行一把；非 AIza 開頭的會自動略過）'}
              rows={4}
              disabled={busy}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)', alignItems: 'center' }}>
              <button className="settings-btn settings-btn--primary" onClick={handleImport} disabled={busy || !draft.trim()}>
                {busy ? '匯入中…' : '匯入 Key'}
              </button>
              <span className="settings-muted" style={{ fontSize: 11 }}>
                {detectedCount > 0 ? `偵測到 ${detectedCount} 把 key` : '貼上 AIza 開頭的 key，一行一把'}
              </span>
            </div>
            {feedback && <p className="settings-muted" style={{ marginTop: 'var(--space-2)' }}>{feedback}</p>}
          </div>
        </>
      )}
    </section>
  );
}

function OpencodeSection() {
  const { config, loading, error, save, test, fetchModels } = useOpencodeServers();
  const [draftServers, setDraftServers] = useState('');
  const [textModel, setTextModel] = useState('');
  const [visionModel, setVisionModel] = useState('');
  const [models, setModels] = useState<OpencodeModel[]>([]);
  const [testResult, setTestResult] = useState<{ ok: boolean; results: OpencodeTestResult[]; error?: string } | null>(null);
  const [savingMsg, setSavingMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    setDraftServers(config.servers.join('\n'));
    setTextModel(config.textModel);
    setVisionModel(config.visionModel);
  }, [config.servers, config.textModel, config.visionModel]);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await test();
      setTestResult(r);
    } catch (e) {
      setTestResult({ ok: false, results: [], error: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const handleLoadModels = async () => {
    setLoadingModels(true);
    try {
      const ms = await fetchModels();
      setModels(ms);
    } catch (e) {
      alert(`載入失敗：${(e as Error).message}`);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSave = async () => {
    setSavingMsg('儲存中…');
    try {
      const serverList = draftServers.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      await save({ servers: serverList, textModel, visionModel });
      setSavingMsg('已儲存');
      setTimeout(() => setSavingMsg(null), 2000);
    } catch (e) {
      setSavingMsg(`儲存失敗：${(e as Error).message}`);
    }
  };

  return (
    <section className="settings-section">
      <header className="settings-section__head">
        <h2 className="settings-section__title">OpenCode 伺服器</h2>
        {testResult?.ok && <span className="settings-section__badge settings-section__badge--ok">已連線</span>}
      </header>
      <p className="settings-muted">
        一行一個 URL。AI 呼叫會依序嘗試所有 OpenCode server，全部失敗後才 fallback 到 Gemini key-pool。
      </p>
      {error && <p className="settings-error">{error}</p>}
      {loading ? <p className="settings-muted">載入中…</p> : (
        <>
          <div className="setting-row">
            <label>Server URLs（一行一個）</label>
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
              <textarea
                value={draftServers}
                onChange={(e) => { setDraftServers(e.target.value); setTestResult(null); }}
                placeholder={'http://localhost:4096\nhttp://opencode-backup:4096'}
                rows={3}
                style={{ flex: 1 }}
              />
              <button className="settings-btn" onClick={handleTest} disabled={testing}>
                {testing ? '測試中…' : '測試連線'}
              </button>
            </div>
            {testResult && (
              <div style={{ marginTop: 'var(--space-2)', fontSize: 12 }}>
                <p className={testResult.ok ? 'settings-success' : 'settings-error'}>
                  {testResult.ok ? '所有 OpenCode server 連線成功' : (testResult.error ?? '部分或全部 server 連線失敗')}
                </p>
                {testResult.results.map(r => (
                  <div key={r.url} className="settings-muted" style={{ fontSize: 11 }}>
                    {r.ok ? '✓' : '✕'} {r.label}: {r.url}{r.error ? ` (${r.error})` : ''} · {r.elapsedMs}ms
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="setting-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div>
              <label>文字模型（無圖片的呼叫）</label>
              {models.length > 0 ? (
                <select value={textModel} onChange={(e) => setTextModel(e.target.value)}>
                  <option value="">（未指定）</option>
                  {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              ) : (
                <input value={textModel} onChange={(e) => setTextModel(e.target.value)} placeholder="例：anthropic/claude-sonnet-4-5" />
              )}
            </div>
            <div>
              <label>視覺模型（含圖片的呼叫）</label>
              {models.length > 0 ? (
                <select value={visionModel} onChange={(e) => setVisionModel(e.target.value)}>
                  <option value="">（未指定）</option>
                  {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              ) : (
                <input value={visionModel} onChange={(e) => setVisionModel(e.target.value)} placeholder="例：anthropic/claude-sonnet-4-5" />
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
            <button className="settings-btn settings-btn--primary" onClick={handleSave}>儲存設定</button>
            <button className="settings-btn" onClick={handleLoadModels} disabled={loadingModels}>
              {loadingModels ? '載入中…' : '重新載入模型列表'}
            </button>
            {savingMsg && <span className={savingMsg === '已儲存' ? 'settings-success' : 'settings-error'} style={{ fontSize: 12, alignSelf: 'center' }}>{savingMsg}</span>}
          </div>
        </>
      )}
    </section>
  );
}

interface OAuthStatus {
  connected: boolean;
  expiresAt?: string | null;
}

function OpenAiOAuthSection() {
  const [status, setStatus] = useState<OAuthStatus>({ connected: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const r = await api<OAuthStatus>('/api/openai-oauth/status');
      setStatus(r);
    } catch { /* ignore */ }
  };

  useEffect(() => { void refresh(); }, []);

  const startOAuth = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { authorizeUrl } = await api<{ authorizeUrl: string }>('/api/openai-oauth/start', { method: 'POST', body: JSON.stringify({}) });
      const popup = window.open(authorizeUrl, '_blank', 'width=600,height=700');
      if (!popup) { setMsg('彈出視窗被阻擋，請允許後重試'); setBusy(false); return; }
      const handler = (ev: MessageEvent) => {
        if (ev.data?.source !== 'openai-oauth') return;
        window.removeEventListener('message', handler);
        if (ev.data.ok) { setMsg('已連結 OpenAI'); void refresh(); }
        else { setMsg(`授權失敗：${ev.data.error ?? '未知錯誤'}`); }
        setBusy(false);
      };
      window.addEventListener('message', handler);
    } catch (e) {
      setMsg(`啟動失敗：${(e as Error).message}`);
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('確定中斷 OpenAI 授權？之後 AI 呼叫會 fallback 到 Gemini。')) return;
    setBusy(true);
    try {
      await api('/api/openai-oauth', { method: 'DELETE' });
      setMsg('已中斷連結');
      await refresh();
    } catch (e) {
      setMsg(`中斷失敗：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-section">
      <header className="settings-section__head">
        <h2 className="settings-section__title">OpenAI 授權連結</h2>
        {status.connected && <span className="settings-section__badge settings-section__badge--ok">已連結</span>}
      </header>
      <p className="settings-muted">
        點擊「連線 OpenAI」後會跳出 PKCE 授權視窗；授權成功後 token 自動寫入伺服器。失敗的 OpenAI 呼叫會 fallback 到 Gemini key-pool。
      </p>
      {status.connected && status.expiresAt && (
        <p className="settings-muted" style={{ fontSize: 12 }}>access_token 到期時間：{new Date(status.expiresAt).toLocaleString()}</p>
      )}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
        <button className="settings-btn settings-btn--primary" onClick={startOAuth} disabled={busy}>
          {busy ? '處理中…' : status.connected ? '重新授權' : '連線 OpenAI'}
        </button>
        {status.connected && (
          <button className="settings-btn settings-btn--danger" onClick={disconnect} disabled={busy}>中斷連結</button>
        )}
      </div>
      {msg && <p className="settings-muted" style={{ marginTop: 'var(--space-2)' }}>{msg}</p>}
    </section>
  );
}

export default function ProvidersTab() {
  return (
    <div className="settings-sections">
      <ApiKeysSection />
      <OpencodeSection />
      <OpenAiOAuthSection />
    </div>
  );
}
