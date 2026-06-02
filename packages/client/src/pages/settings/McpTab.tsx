import { useState } from 'react';
import { useMcpServers, type McpHttpServer, type McpTestResult, type McpToolInfo } from '../../hooks/useMcpServers';

interface FormState {
  id: string | null;
  name: string;
  endpoint: string;
  timeoutMs: string;
  enabled: boolean;
  useRecommendedTools: boolean;
  allowedTools: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  endpoint: '',
  timeoutMs: '15000',
  enabled: true,
  useRecommendedTools: false,
  allowedTools: '',
};

function supportsRecommended(name: string): boolean {
  return name.trim().toLowerCase() === 'mssql-mcp';
}

export default function McpTab() {
  const { servers, loading, error, create, update, remove, test, listTools } = useMcpServers();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [testResults, setTestResults] = useState<Record<string, McpTestResult>>({});
  const [toolsByServer, setToolsByServer] = useState<Record<string, McpToolInfo[]>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, 'test' | 'tools' | 'delete' | null>>({});

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(false);
  };

  const openNew = () => {
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (s: McpHttpServer) => {
    setForm({
      id: s.id,
      name: s.name,
      endpoint: s.endpoint,
      timeoutMs: String(s.timeoutMs),
      enabled: s.enabled,
      useRecommendedTools: s.useRecommendedTools,
      allowedTools: s.allowedTools.join('\n'),
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('需要 MCP 名稱'); return; }
    if (!form.endpoint.trim()) { setFormError('需要 endpoint'); return; }
    if (!/^https?:\/\//i.test(form.endpoint)) { setFormError('endpoint 必須以 http(s):// 開頭'); return; }
    setBusy(true);
    setFormError(null);
    try {
      const allowedTools = form.allowedTools.split(/\r?\n/).map(t => t.trim()).filter(Boolean);
      const timeoutMs = Number.parseInt(form.timeoutMs, 10) || 15000;
      const payload = {
        name: form.name.trim(),
        endpoint: form.endpoint.trim(),
        enabled: form.enabled,
        useRecommendedTools: form.useRecommendedTools && supportsRecommended(form.name),
        allowedTools,
        timeoutMs,
      };
      if (form.id) await update(form.id, payload);
      else await create(payload);
      resetForm();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (s: McpHttpServer) => {
    if (!confirm(`確定刪除 MCP server「${s.name}」？`)) return;
    setActionLoading(prev => ({ ...prev, [s.id]: 'delete' }));
    try { await remove(s.id); }
    catch (e) { alert((e as Error).message); }
    finally { setActionLoading(prev => ({ ...prev, [s.id]: null })); }
  };

  const handleTest = async (s: McpHttpServer) => {
    setActionLoading(prev => ({ ...prev, [s.id]: 'test' }));
    try {
      const r = await test(s.id);
      setTestResults(prev => ({ ...prev, [s.id]: r }));
    } catch (e) {
      setTestResults(prev => ({ ...prev, [s.id]: { ok: false, error: (e as Error).message } }));
    } finally {
      setActionLoading(prev => ({ ...prev, [s.id]: null }));
    }
  };

  const handleListTools = async (s: McpHttpServer) => {
    setActionLoading(prev => ({ ...prev, [s.id]: 'tools' }));
    try {
      const tools = await listTools(s.id);
      setToolsByServer(prev => ({ ...prev, [s.id]: tools }));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setActionLoading(prev => ({ ...prev, [s.id]: null }));
    }
  };

  return (
    <div className="settings-sections">
      <section className="settings-section">
        <header className="settings-section__head">
          <h2 className="settings-section__title">MCP Servers</h2>
          <span className="settings-section__badge">{servers.length} 個</span>
        </header>
        <p className="settings-muted">
          管理員可在這裡管理自架 HTTP MCP server。建議接入 mssql-mcp（<code>http://srvhpgit1:32500/mcp</code>）。
        </p>
        {error && <p className="settings-error">{error}</p>}

        {!showForm && (
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <button className="settings-btn settings-btn--primary" onClick={openNew}>+ 新增 MCP Server</button>
          </div>
        )}

        {showForm && (
          <div className="settings-form">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 'var(--space-3)' }}>
              <div className="setting-row" style={{ marginBottom: 0 }}>
                <label>Server 名稱</label>
                <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="例：mssql-mcp" />
              </div>
              <div className="setting-row" style={{ marginBottom: 0 }}>
                <label>Timeout (ms)</label>
                <input value={form.timeoutMs} onChange={(e) => setForm(f => ({ ...f, timeoutMs: e.target.value }))} placeholder="15000" />
              </div>
            </div>
            <div className="setting-row">
              <label>HTTP Endpoint</label>
              <input value={form.endpoint} onChange={(e) => setForm(f => ({ ...f, endpoint: e.target.value }))} placeholder="http://srvhpgit1:32500/mcp" />
            </div>
            <div className="setting-row">
              <label>允許工具（一行一個）</label>
              <textarea
                value={form.allowedTools}
                onChange={(e) => setForm(f => ({ ...f, allowedTools: e.target.value }))}
                disabled={supportsRecommended(form.name) && form.useRecommendedTools}
                placeholder="每行一個 tool name；留白且未啟用建議白名單時，顧問模式不會呼叫任何 tool"
                rows={4}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
              {supportsRecommended(form.name) && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'var(--space-2)', fontSize: 13, color: 'var(--text-secondary)', textTransform: 'none', letterSpacing: 0 }}>
                  <input
                    type="checkbox"
                    checked={form.useRecommendedTools}
                    onChange={(e) => setForm(f => ({
                      ...f,
                      useRecommendedTools: e.target.checked,
                      allowedTools: e.target.checked ? 'get-table-schema\nlist-all-tables' : f.allowedTools,
                    }))}
                  />
                  使用 mssql-mcp 建議工具白名單
                </label>
              )}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 'var(--space-3)', fontSize: 13, color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm(f => ({ ...f, enabled: e.target.checked }))} />
              啟用此 MCP server（scope: consultant）
            </label>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button className="settings-btn settings-btn--primary" onClick={handleSave} disabled={busy}>
                {busy ? '儲存中…' : form.id ? '更新 MCP Server' : '新增 MCP Server'}
              </button>
              <button className="settings-btn" onClick={resetForm}>取消</button>
            </div>
            {formError && <p className="settings-error" style={{ marginTop: 'var(--space-2)' }}>{formError}</p>}
          </div>
        )}

        <div style={{ marginTop: 'var(--space-4)' }}>
          {loading ? <p className="settings-muted">載入中…</p>
            : servers.length === 0 ? <p className="settings-muted">尚未設定 MCP server</p>
            : (
              <div className="settings-table-wrap">
                <table className="settings-table">
                  <thead>
                    <tr>
                      <th>名稱</th>
                      <th>Endpoint</th>
                      <th>狀態</th>
                      <th>允許工具</th>
                      <th className="settings-table__actions">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {servers.map(s => {
                      const tr = testResults[s.id];
                      const tools = toolsByServer[s.id] ?? [];
                      const action = actionLoading[s.id];
                      return (
                        <tr key={s.id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{s.name}</div>
                            <div className="settings-muted" style={{ fontSize: 11 }}>{s.transport} / {s.scope}</div>
                          </td>
                          <td>
                            <code className="settings-inline-code">{s.endpoint}</code>
                            <div className="settings-muted" style={{ fontSize: 11, marginTop: 4 }}>timeout {s.timeoutMs}ms</div>
                          </td>
                          <td>
                            <span className={s.enabled ? 'settings-status settings-status--active' : 'settings-status settings-status--disabled'}>
                              {s.enabled ? '啟用' : '停用'}
                            </span>
                            {tr && (
                              <div style={{ marginTop: 4, fontSize: 11 }} className={tr.ok ? 'settings-success' : 'settings-error'}>
                                {tr.ok ? `OK${tr.serverInfo?.name ? ` · ${tr.serverInfo.name}` : ''}` : `失敗 · ${tr.error}`}
                              </div>
                            )}
                          </td>
                          <td>
                            <div style={{ fontSize: 12 }}>
                              {s.allowedTools.length > 0 ? s.allowedTools.join(', ') : <span className="settings-muted">未設定（顧問模式不會呼叫）</span>}
                            </div>
                            {s.useRecommendedTools && <div className="settings-muted" style={{ fontSize: 11, marginTop: 2 }}>使用建議工具白名單</div>}
                            {tools.length > 0 && (
                              <div className="settings-muted" style={{ fontSize: 11, marginTop: 4 }}>
                                tools: {tools.map(t => t.name).join(', ')}
                              </div>
                            )}
                          </td>
                          <td className="settings-table__actions">
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              <button className="settings-btn" onClick={() => openEdit(s)}>編輯</button>
                              <button className="settings-btn" onClick={() => handleTest(s)} disabled={action === 'test'}>
                                {action === 'test' ? '測試中…' : '測試'}
                              </button>
                              <button className="settings-btn" onClick={() => handleListTools(s)} disabled={action === 'tools'}>
                                {action === 'tools' ? '讀取中…' : '列工具'}
                              </button>
                              <button className="settings-btn settings-btn--danger" onClick={() => handleDelete(s)} disabled={action === 'delete'}>
                                刪除
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      </section>
    </div>
  );
}
