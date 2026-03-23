import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface KeyInfo {
  suffix: string;
  todayCalls: number;
  todayTokens: number;
  totalCalls: number;
  totalTokens: number;
  fromEnv?: boolean;
}

interface UsageStats {
  today: { calls: number; tokens: number };
  week: { calls: number; tokens: number };
  month: { calls: number; tokens: number };
}

interface UserInfo {
  id: string;
  name: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  created_at: string;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function getToken(): string | null {
  return sessionStorage.getItem('admin_token');
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

function getBridgeToken(): string | null {
  return localStorage.getItem('bridge_token') ?? localStorage.getItem('pb-auth-token');
}

function bridgeAuthHeaders(): Record<string, string> {
  const token = getBridgeToken();
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

type AuthState = 'loading' | 'setup' | 'login' | 'authenticated';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user: authUser, loading: authLoading, requireAuth } = useAuth();

  // Auth state
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [authError, setAuthError] = useState('');

  // Setup form
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');

  // Login form
  const [loginPassword, setLoginPassword] = useState('');

  // Change password
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [changeError, setChangeError] = useState('');
  const [changeSuccess, setChangeSuccess] = useState('');

  // Key management
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [model, setModel] = useState('gemini-2.5-flash');
  const [newKey, setNewKey] = useState('');
  const [addState, setAddState] = useState<'idle' | 'adding' | 'error'>('idle');
  const [addError, setAddError] = useState('');
  const [loading, setLoading] = useState(true);
  const [envKeySet, setEnvKeySet] = useState(false);

  // Usage stats
  const [usage, setUsage] = useState<UsageStats | null>(null);

  // Model preference
  const [selectedModel, setSelectedModel] = useState(
    () => localStorage.getItem('pb-default-model') ?? 'gemini-2.5-flash'
  );
  const [language, setLanguage] = useState(
    () => localStorage.getItem('pb-language') ?? '繁體中文'
  );

  // User management
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserSubmitting, setNewUserSubmitting] = useState(false);
  const [newUserError, setNewUserError] = useState('');
  const [userActionError, setUserActionError] = useState('');

  // ─── Auth flow ─────────────────────────────────────
  // If new-system admin is logged in, skip old auth entirely
  useEffect(() => {
    if (!authLoading && authUser?.role === 'admin') {
      setAuthState('authenticated');
    }
  }, [authUser, authLoading]);

  useEffect(() => {
    if (authLoading) return; // wait for AuthContext to resolve
    if (authUser?.role === 'admin') return; // handled above

    (async () => {
      try {
        const res = await fetch('/api/auth/status');
        if (!res.ok) throw new Error();
        const data = await res.json();

        if (!data.hasPassword) {
          setAuthState('setup');
          return;
        }

        // Has password — check if we have a valid token (old system)
        const token = getToken();
        if (token) {
          const testRes = await fetch('/api/settings', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (testRes.ok) {
            setAuthState('authenticated');
            return;
          }
          sessionStorage.removeItem('admin_token');
        }
        setAuthState('login');
      } catch {
        setAuthState('authenticated');
      }
    })();
  }, [authLoading, authUser]);

  const handleSetup = async () => {
    setAuthError('');
    if (!setupPassword || setupPassword.length < 4) {
      setAuthError('密碼至少需要 4 個字元');
      return;
    }
    if (setupPassword !== setupConfirm) {
      setAuthError('兩次輸入的密碼不一致');
      return;
    }
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: setupPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || '設定失敗');
        return;
      }
      sessionStorage.setItem('admin_token', data.token);
      setAuthState('authenticated');
    } catch {
      setAuthError('網路錯誤');
    }
  };

  const handleLogin = async () => {
    setAuthError('');
    if (!loginPassword) {
      setAuthError('請輸入密碼');
      return;
    }
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || '驗證失敗');
        return;
      }
      sessionStorage.setItem('admin_token', data.token);
      setAuthState('authenticated');
    } catch {
      setAuthError('網路錯誤');
    }
  };

  const handleChangePassword = async () => {
    setChangeError('');
    setChangeSuccess('');
    if (!currentPassword) {
      setChangeError('請輸入目前密碼');
      return;
    }
    if (!newPassword || newPassword.length < 4) {
      setChangeError('新密碼至少需要 4 個字元');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setChangeError('兩次輸入的新密碼不一致');
      return;
    }
    try {
      const res = await fetch('/api/auth/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setChangeError(data.error || '變更失敗');
        return;
      }
      sessionStorage.setItem('admin_token', data.token);
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
      setChangeSuccess('密碼已成功變更');
      setTimeout(() => setChangeSuccess(''), 3000);
    } catch {
      setChangeError('網路錯誤');
    }
  };

  // ─── Settings data loading ─────────────────────────
  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/api-keys', { headers: bridgeAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys || []);
        setModel(data.model || 'gemini-2.5-flash');
      }
    } catch { /* ignore */ }
  }, []);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/token-usage', { headers: bridgeAuthHeaders() });
      if (res.ok) setUsage(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (authState !== 'authenticated') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/settings', { headers: bridgeAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setEnvKeySet(data.envKeys?.GEMINI_API_KEY ?? false);
        }
      } catch { /* ignore */ }
      await Promise.all([fetchKeys(), fetchUsage()]);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [authState, fetchKeys, fetchUsage]);

  // ─── User management ────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await fetch('/api/users/all', { headers: bridgeAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const list = data.users || data || [];
        setUsers(list.map((u: any) => ({
          ...u,
          status: u.is_active === 1 || u.is_active === true ? 'active' : 'disabled',
        })));
      }
    } catch { /* ignore */ }
    setUsersLoading(false);
  }, []);

  useEffect(() => {
    if (authState !== 'authenticated') return;
    if (authUser?.role === 'admin') fetchUsers();
  }, [authState, authUser, fetchUsers]);

  const handleAddUser = async () => {
    setNewUserError('');
    const name = newUserName.trim();
    if (!name) {
      setNewUserError('請輸入使用者名稱');
      return;
    }
    setNewUserSubmitting(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bridgeAuthHeaders() },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNewUserError(data.error || '新增失敗');
        setNewUserSubmitting(false);
        return;
      }
      setNewUserName('');
      await fetchUsers();
    } catch {
      setNewUserError('網路錯誤');
    }
    setNewUserSubmitting(false);
  };

  const handleToggleUser = async (u: UserInfo) => {
    setUserActionError('');
    const action = u.status === 'active' ? 'disable' : 'enable';
    try {
      const res = await fetch(`/api/users/${u.id}/${action}`, {
        method: 'PATCH',
        headers: bridgeAuthHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setUserActionError(data.error || '操作失敗');
        return;
      }
      await fetchUsers();
    } catch {
      setUserActionError('網路錯誤');
    }
  };

  const handleDeleteUser = async (u: UserInfo) => {
    if (!window.confirm('確定刪除使用者 ' + u.name + '?')) return;
    setUserActionError('');
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: 'DELETE',
        headers: bridgeAuthHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setUserActionError(data.error || '刪除失敗');
        return;
      }
      await fetchUsers();
    } catch {
      setUserActionError('網路錯誤');
    }
  };

  const handleTransferAdmin = async (u: UserInfo) => {
    if (!window.confirm('確定將管理員權限轉移給 ' + u.name + '?')) return;
    setUserActionError('');
    try {
      const res = await fetch('/api/users/transfer-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bridgeAuthHeaders() },
        body: JSON.stringify({ targetUserId: u.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setUserActionError(data.error || '轉移失敗');
        return;
      }
      await fetchUsers();
    } catch {
      setUserActionError('網路錯誤');
    }
  };

  const handleAddKey = async () => {
    const trimmed = newKey.trim();
    if (!trimmed || !trimmed.startsWith('AIza')) {
      setAddError('API Key 必須以 AIza 開頭');
      setAddState('error');
      return;
    }
    setAddState('adding');
    setAddError('');
    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bridgeAuthHeaders() },
        body: JSON.stringify({ apiKey: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error || '新增失敗');
        setAddState('error');
        return;
      }
      setKeys(data.keys || []);
      setNewKey('');
      setAddState('idle');
      fetchUsage();
    } catch {
      setAddError('網路錯誤');
      setAddState('error');
    }
  };

  const handleDeleteKey = async (suffix: string) => {
    try {
      const res = await fetch(`/api/settings/api-keys/${suffix}`, {
        method: 'DELETE',
        headers: bridgeAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys || []);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || '刪除失敗');
      }
    } catch { /* ignore */ }
  };

  const handleSaveModel = async (newModel: string) => {
    setSelectedModel(newModel);
    localStorage.setItem('pb-default-model', newModel);
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...bridgeAuthHeaders() },
      body: JSON.stringify({ key: 'gemini_model', value: newModel }),
    });
  };

  const handleSaveLanguage = (lang: string) => {
    setLanguage(lang);
    localStorage.setItem('pb-language', lang);
  };

  // ─── Auth screens ──────────────────────────────────
  if (authState === 'loading') {
    return (
      <div style={styles.container}>
        <header style={styles.header}>
          <div style={styles.headerLeft}>
            <button style={styles.backBtn} onClick={() => navigate('/')} title="返回首頁">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 15l-5-5 5-5" />
              </svg>
            </button>
            <h1 style={styles.headerTitle}>設定</h1>
          </div>
        </header>
        <main style={styles.main}>
          <p style={styles.loadingText}>載入中...</p>
        </main>
      </div>
    );
  }

  if (authState === 'setup') {
    return (
      <div style={styles.container}>
        <header style={styles.header}>
          <div style={styles.headerLeft}>
            <button style={styles.backBtn} onClick={() => navigate('/')} title="返回首頁">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 15l-5-5 5-5" />
              </svg>
            </button>
            <h1 style={styles.headerTitle}>設定</h1>
          </div>
        </header>
        <main style={styles.main}>
          <section style={styles.section}>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>設定管理員密碼</h2>
              <div style={styles.sectionDivider} />
            </div>
            <p style={{ ...styles.hint, marginBottom: '16px' }}>
              首次使用，請設定管理員密碼以保護設定頁面。
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '400px' }}>
              <div>
                <label style={styles.label}>密碼</label>
                <input
                  type="password"
                  style={styles.input}
                  value={setupPassword}
                  onChange={e => { setSetupPassword(e.target.value); setAuthError(''); }}
                  placeholder="輸入密碼（至少 4 個字元）"
                  onKeyDown={e => e.key === 'Enter' && handleSetup()}
                  data-testid="setup-password"
                />
              </div>
              <div>
                <label style={styles.label}>確認密碼</label>
                <input
                  type="password"
                  style={styles.input}
                  value={setupConfirm}
                  onChange={e => { setSetupConfirm(e.target.value); setAuthError(''); }}
                  placeholder="再次輸入密碼"
                  onKeyDown={e => e.key === 'Enter' && handleSetup()}
                  data-testid="setup-confirm"
                />
              </div>
              <button style={styles.primaryBtn} onClick={handleSetup} data-testid="setup-submit">
                設定密碼
              </button>
              {authError && <p style={styles.errorText}>{authError}</p>}
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (authState === 'login') {
    return (
      <div style={styles.container}>
        <header style={styles.header}>
          <div style={styles.headerLeft}>
            <button style={styles.backBtn} onClick={() => navigate('/')} title="返回首頁">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 15l-5-5 5-5" />
              </svg>
            </button>
            <h1 style={styles.headerTitle}>設定</h1>
          </div>
        </header>
        <main style={styles.main}>
          <section style={styles.section}>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>請輸入管理員密碼</h2>
              <div style={styles.sectionDivider} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '400px' }}>
              <div>
                <label style={styles.label}>密碼</label>
                <input
                  type="password"
                  style={styles.input}
                  value={loginPassword}
                  onChange={e => { setLoginPassword(e.target.value); setAuthError(''); }}
                  placeholder="輸入管理員密碼"
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  data-testid="login-password"
                />
              </div>
              <button style={styles.primaryBtn} onClick={handleLogin} data-testid="login-submit">
                登入
              </button>
              {authError && <p style={styles.errorText}>{authError}</p>}
            </div>
          </section>
        </main>
      </div>
    );
  }

  // ─── Authenticated: full settings page ─────────────
  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backBtn} onClick={() => navigate('/')} title="返回首頁">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 15l-5-5 5-5" />
            </svg>
          </button>
          <h1 style={styles.headerTitle}>設定</h1>
        </div>
      </header>

      <main style={styles.main}>

        {/* ── Section: API Key Management ──────────────── */}
        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Gemini API Keys</h2>
            <div style={styles.sectionDivider} />
            <span style={styles.badge}>{keys.length} keys</span>
          </div>

          {loading ? (
            <p style={styles.loadingText}>載入中...</p>
          ) : (
            <>
              {envKeySet && (
                <div style={styles.infoNotice}>
                  已透過環境變數設定 Gemini API 金鑰。
                </div>
              )}

              {/* Key table */}
              {keys.length > 0 && (
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Key</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>Today</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>Total Calls</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>Total Tokens</th>
                        <th style={{ ...styles.th, width: '40px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {keys.map((k, i) => (
                        <tr key={k.suffix} style={i % 2 === 0 ? {} : styles.evenRow}>
                          <td style={styles.td}>
                            <code style={styles.keySuffix}>...{k.suffix}</code>
                          </td>
                          <td style={{ ...styles.td, textAlign: 'right' }}>
                            <span style={styles.statNum}>{k.todayCalls}</span>
                            <span style={styles.statLabel}> calls</span>
                          </td>
                          <td style={{ ...styles.td, textAlign: 'right' }}>
                            <span style={styles.statNum}>{k.totalCalls}</span>
                          </td>
                          <td style={{ ...styles.td, textAlign: 'right' }}>
                            <span style={styles.statNum}>{formatTokens(k.totalTokens)}</span>
                          </td>
                          <td style={styles.td}>
                            {k.fromEnv ? (
                              <span title="透過環境變數設定，無法從 UI 刪除" style={styles.envBadge}>ENV</span>
                            ) : (
                              <button
                                type="button"
                                style={styles.deleteBtn}
                                onClick={() => handleDeleteKey(k.suffix)}
                                title="刪除此 Key"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                </svg>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Add new key */}
              <div style={{ ...styles.inputRow, marginTop: '12px' }}>
                <input
                  type="text"
                  style={styles.input}
                  value={newKey}
                  onChange={e => { setNewKey(e.target.value); setAddState('idle'); setAddError(''); }}
                  placeholder="貼上新的 API Key (AIza...)"
                  disabled={addState === 'adding'}
                  onKeyDown={e => e.key === 'Enter' && handleAddKey()}
                />
                <button
                  style={{
                    ...styles.primaryBtn,
                    ...(addState === 'adding' ? styles.btnDisabled : {}),
                  }}
                  onClick={handleAddKey}
                  disabled={addState === 'adding'}
                >
                  {addState === 'adding' ? '驗證中...' : '+ 新增'}
                </button>
              </div>
              {addError && <p style={styles.errorText}>{addError}</p>}
            </>
          )}
        </section>

        {/* ── Section: Token Usage ─────────────────────── */}
        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Token Usage</h2>
            <div style={styles.sectionDivider} />
          </div>

          {usage ? (
            <div style={styles.usageGrid}>
              <div style={styles.usageCard}>
                <div style={styles.usageLabel}>Today</div>
                <div style={styles.usageNum}>{usage.today.calls}</div>
                <div style={styles.usageSub}>calls / {formatTokens(usage.today.tokens)} tokens</div>
              </div>
              <div style={styles.usageCard}>
                <div style={styles.usageLabel}>7 Days</div>
                <div style={styles.usageNum}>{usage.week.calls}</div>
                <div style={styles.usageSub}>calls / {formatTokens(usage.week.tokens)} tokens</div>
              </div>
              <div style={styles.usageCard}>
                <div style={styles.usageLabel}>30 Days</div>
                <div style={styles.usageNum}>{usage.month.calls}</div>
                <div style={styles.usageSub}>calls / {formatTokens(usage.month.tokens)} tokens</div>
              </div>
            </div>
          ) : (
            <p style={styles.loadingText}>載入中...</p>
          )}
        </section>

        {/* ── Section: Generation Preferences ─────────── */}
        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>生成偏好</h2>
            <div style={styles.sectionDivider} />
          </div>

          <div style={styles.prefGrid}>
            <div style={styles.prefField}>
              <label style={styles.label}>AI Model</label>
              <p style={styles.hint}>用於所有 AI 呼叫的 Gemini 模型</p>
              <select
                style={styles.select}
                value={selectedModel}
                onChange={e => handleSaveModel(e.target.value)}
              >
                <option value="gemini-2.5-flash">gemini-2.5-flash (推薦)</option>
                <option value="gemini-2.5-pro">gemini-2.5-pro (品質優先)</option>
                <option value="gemini-2.0-flash">gemini-2.0-flash</option>
              </select>
              <p style={styles.hint}>目前 Server 使用: {model}</p>
            </div>

            <div style={styles.prefField}>
              <label style={styles.label}>AI 回應語言</label>
              <p style={styles.hint}>AI 生成內容所使用的語言</p>
              <select
                style={styles.select}
                value={language}
                onChange={e => handleSaveLanguage(e.target.value)}
              >
                <option value="繁體中文">繁體中文</option>
                <option value="English">English</option>
              </select>
            </div>
          </div>
        </section>

        {/* ── Section: Change Password ────────────────── */}
        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>變更密碼</h2>
            <div style={styles.sectionDivider} />
          </div>

          {!showChangePassword ? (
            <button
              style={{ ...styles.primaryBtn, backgroundColor: '#64748b' }}
              onClick={() => setShowChangePassword(true)}
              data-testid="show-change-password"
            >
              變更管理員密碼
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '400px' }}>
              <div>
                <label style={styles.label}>目前密碼</label>
                <input
                  type="password"
                  style={styles.input}
                  value={currentPassword}
                  onChange={e => { setCurrentPassword(e.target.value); setChangeError(''); }}
                  placeholder="輸入目前密碼"
                  data-testid="change-current-password"
                />
              </div>
              <div>
                <label style={styles.label}>新密碼</label>
                <input
                  type="password"
                  style={styles.input}
                  value={newPassword}
                  onChange={e => { setNewPassword(e.target.value); setChangeError(''); }}
                  placeholder="輸入新密碼（至少 4 個字元）"
                  data-testid="change-new-password"
                />
              </div>
              <div>
                <label style={styles.label}>確認新密碼</label>
                <input
                  type="password"
                  style={styles.input}
                  value={newPasswordConfirm}
                  onChange={e => { setNewPasswordConfirm(e.target.value); setChangeError(''); }}
                  placeholder="再次輸入新密碼"
                  onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
                  data-testid="change-confirm-password"
                />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button style={styles.primaryBtn} onClick={handleChangePassword} data-testid="change-password-submit">
                  確認變更
                </button>
                <button
                  style={{ ...styles.primaryBtn, backgroundColor: '#94a3b8' }}
                  onClick={() => { setShowChangePassword(false); setChangeError(''); setChangeSuccess(''); }}
                >
                  取消
                </button>
              </div>
              {changeError && <p style={styles.errorText}>{changeError}</p>}
              {changeSuccess && <p style={{ ...styles.hint, color: '#16a34a', fontWeight: 600 }}>{changeSuccess}</p>}
            </div>
          )}
        </section>

        {/* ── Section: User Management (admin only) ────── */}
        {!authUser && (
          <section style={styles.section}>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>使用者管理</h2>
              <div style={styles.sectionDivider} />
            </div>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
              以管理員身分登入後可管理使用者。
            </p>
            <button
              type="button"
              onClick={() => requireAuth()}
              style={{ padding: '8px 16px', background: '#8E6FA7', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
              data-testid="admin-login-btn"
            >
              👤 切換使用者 / 管理員登入
            </button>
          </section>
        )}
        {authUser && authUser.role !== 'admin' && (
          <section style={styles.section}>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>使用者管理</h2>
              <div style={styles.sectionDivider} />
            </div>
            <p style={{ fontSize: 13, color: '#64748b' }}>
              僅管理員可存取使用者管理功能。目前登入：{authUser.name}
            </p>
          </section>
        )}
        {authUser?.role === 'admin' && (
          <section style={styles.section}>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>使用者管理</h2>
              <div style={styles.sectionDivider} />
              <span style={styles.badge}>{users.length} 位</span>
            </div>

            {/* Add user form */}
            <div style={{ marginBottom: '16px' }}>
              <label style={styles.label}>新增使用者</label>
              <div style={{ ...styles.inputRow, marginTop: '4px' }}>
                <input
                  type="text"
                  style={{ ...styles.input, fontFamily: 'inherit' }}
                  value={newUserName}
                  onChange={e => { setNewUserName(e.target.value); setNewUserError(''); }}
                  placeholder="輸入使用者名稱"
                  disabled={newUserSubmitting}
                  onKeyDown={e => e.key === 'Enter' && handleAddUser()}
                  data-testid="new-user-name"
                />
                <button
                  style={{
                    ...styles.primaryBtn,
                    ...(newUserSubmitting ? styles.btnDisabled : {}),
                  }}
                  onClick={handleAddUser}
                  disabled={newUserSubmitting}
                  data-testid="new-user-submit"
                >
                  {newUserSubmitting ? '新增中...' : '+ 新增使用者'}
                </button>
              </div>
              {newUserError && <p style={styles.errorText}>{newUserError}</p>}
            </div>

            {/* Users table */}
            {usersLoading ? (
              <p style={styles.loadingText}>載入中...</p>
            ) : users.length === 0 ? (
              <p style={styles.loadingText}>尚無使用者</p>
            ) : (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>名稱</th>
                      <th style={styles.th}>角色</th>
                      <th style={styles.th}>狀態</th>
                      <th style={styles.th}>建立時間</th>
                      <th style={{ ...styles.th, textAlign: 'right' as const }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u, i) => (
                      <tr key={u.id} style={i % 2 === 0 ? {} : styles.evenRow}>
                        <td style={styles.td}>
                          <span style={{ fontWeight: 500, color: '#1e293b' }}>{u.name}</span>
                        </td>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.roleBadge,
                            ...(u.role === 'admin' ? styles.roleBadgeAdmin : styles.roleBadgeUser),
                          }}>
                            {u.role === 'admin' ? '管理員' : '使用者'}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.statusBadge,
                            ...(u.status === 'active' ? styles.statusActive : styles.statusDisabled),
                          }}>
                            {u.status === 'active' ? '啟用' : '停用'}
                          </span>
                        </td>
                        <td style={{ ...styles.td, color: '#64748b', fontSize: '12px' }}>
                          {new Date(u.created_at).toLocaleDateString('zh-TW', {
                            year: 'numeric', month: '2-digit', day: '2-digit',
                          })}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right' as const }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            {/* Transfer admin — only for non-admin active users */}
                            {u.role !== 'admin' && u.status === 'active' && (
                              <button
                                type="button"
                                style={styles.actionBtnNeutral}
                                onClick={() => handleTransferAdmin(u)}
                                title="轉移管理員權限"
                                data-testid={`transfer-admin-${u.id}`}
                              >
                                轉移管理員
                              </button>
                            )}
                            {/* Enable / Disable */}
                            <button
                              type="button"
                              style={u.status === 'active' ? styles.actionBtnWarn : styles.actionBtnGreen}
                              onClick={() => handleToggleUser(u)}
                              data-testid={`toggle-user-${u.id}`}
                            >
                              {u.status === 'active' ? '停用' : '啟用'}
                            </button>
                            {/* Delete */}
                            <button
                              type="button"
                              style={styles.deleteBtn}
                              onClick={() => handleDeleteUser(u)}
                              title="刪除使用者"
                              data-testid={`delete-user-${u.id}`}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {userActionError && <p style={{ ...styles.errorText, marginTop: '8px' }}>{userActionError}</p>}
          </section>
        )}

      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', backgroundColor: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  header: { display: 'flex', alignItems: 'center', padding: '0 32px', height: '56px', backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
  headerTitle: { margin: 0, fontSize: '18px', fontWeight: 600, color: '#1e293b' },
  backBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#fff', color: '#475569', cursor: 'pointer', padding: 0 },
  main: { maxWidth: '720px', margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '24px' },
  section: { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px' },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' },
  sectionTitle: { margin: 0, fontSize: '15px', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap' },
  sectionDivider: { flex: 1, height: '1px', backgroundColor: '#e2e8f0' },
  badge: { padding: '2px 8px', borderRadius: '10px', backgroundColor: '#f1f5f9', fontSize: '12px', fontWeight: 500, color: '#64748b' },
  loadingText: { color: '#64748b', fontSize: '14px', margin: 0 },
  infoNotice: { padding: '10px 12px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', fontSize: '13px', color: '#1e40af', marginBottom: '12px' },
  label: { display: 'block', fontSize: '14px', fontWeight: 500, color: '#475569', marginBottom: '4px' },
  hint: { margin: '0 0 8px', fontSize: '12px', color: '#94a3b8' },
  inputRow: { display: 'flex', gap: '8px', alignItems: 'center' },
  input: { width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', outline: 'none', color: '#1e293b', backgroundColor: '#fff', fontFamily: 'monospace', boxSizing: 'border-box' as const },
  errorText: { margin: '6px 0 0', fontSize: '12px', color: '#ef4444' },
  primaryBtn: { padding: '9px 20px', border: 'none', borderRadius: '8px', backgroundColor: '#3b82f6', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'background-color 0.15s', minWidth: '80px', whiteSpace: 'nowrap' as const },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  // Table
  tableWrap: { overflowX: 'auto' as const, borderRadius: '8px', border: '1px solid #e2e8f0' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' },
  th: { padding: '8px 12px', textAlign: 'left' as const, fontWeight: 600, color: '#64748b', fontSize: '12px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' },
  td: { padding: '10px 12px', borderBottom: '1px solid #f1f5f9' },
  evenRow: { backgroundColor: '#f8fafc' },
  keySuffix: { backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '13px', fontFamily: 'monospace' },
  statNum: { fontWeight: 600, color: '#1e293b' },
  statLabel: { color: '#94a3b8', fontSize: '12px' },
  deleteBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', border: '1px solid #fecaca', borderRadius: '6px', backgroundColor: '#fff', color: '#ef4444', cursor: 'pointer', padding: 0, transition: 'background-color 0.15s' },
  envBadge: { fontSize: 11, color: '#94a3b8', padding: '0 6px' } as React.CSSProperties,
  // Usage cards
  usageGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' },
  usageCard: { padding: '16px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' as const },
  usageLabel: { fontSize: '12px', fontWeight: 500, color: '#94a3b8', marginBottom: '4px' },
  usageNum: { fontSize: '28px', fontWeight: 700, color: '#1e293b' },
  usageSub: { fontSize: '12px', color: '#64748b', marginTop: '2px' },
  // Preferences
  prefGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
  prefField: { display: 'flex', flexDirection: 'column' as const },
  select: { padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', color: '#1e293b', backgroundColor: '#fff', cursor: 'pointer', outline: 'none' },
  // User management action buttons
  actionBtnWarn: { padding: '4px 10px', border: '1px solid #fed7aa', borderRadius: '6px', backgroundColor: '#fff7ed', color: '#c2410c', fontSize: '12px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  actionBtnGreen: { padding: '4px 10px', border: '1px solid #bbf7d0', borderRadius: '6px', backgroundColor: '#f0fdf4', color: '#15803d', fontSize: '12px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  actionBtnNeutral: { padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: '#f8fafc', color: '#475569', fontSize: '12px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  // Role / status badges
  roleBadge: { padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 },
  roleBadgeAdmin: { backgroundColor: '#eff6ff', color: '#1d4ed8' },
  roleBadgeUser: { backgroundColor: '#f8fafc', color: '#64748b' },
  statusBadge: { padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 },
  statusActive: { backgroundColor: '#f0fdf4', color: '#15803d' },
  statusDisabled: { backgroundColor: '#fef2f2', color: '#b91c1c' },
};
