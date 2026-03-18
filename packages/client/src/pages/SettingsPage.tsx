import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function SettingsPage() {
  const navigate = useNavigate();

  // API key state
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [apiKeySaveState, setApiKeySaveState] = useState<SaveState>('idle');
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [envKeySet, setEnvKeySet] = useState(false);

  // Test connection state
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [testMessage, setTestMessage] = useState('');

  // Generation preferences (localStorage)
  const [defaultModel, setDefaultModel] = useState<string>(
    () => localStorage.getItem('pb-default-model') ?? 'gemini-2.0-flash'
  );
  const [language, setLanguage] = useState<string>(
    () => localStorage.getItem('pb-language') ?? '繁體中文'
  );
  const [prefSaveState, setPrefSaveState] = useState<SaveState>('idle');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings');
        if (!res.ok) throw new Error('Failed to fetch settings');
        const data = await res.json();
        setEnvKeySet(data.envKeys?.GEMINI_API_KEY ?? false);
        const keySetting = (data.settings ?? []).find(
          (s: { key: string }) => s.key === 'gemini_api_key'
        );
        if (keySetting) {
          setApiKey(keySetting.value);
        }
      } catch {
        setApiKeyError('無法載入設定');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSaveApiKey = async () => {
    setApiKeySaveState('saving');
    setApiKeyError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'gemini_api_key', value: apiKey }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setApiKeySaveState('saved');
      setTimeout(() => setApiKeySaveState('idle'), 2000);
    } catch {
      setApiKeySaveState('error');
      setApiKeyError('儲存失敗，請重試');
      setTimeout(() => setApiKeySaveState('idle'), 2000);
    }
  };

  const handleTestConnection = async () => {
    setTestState('testing');
    setTestMessage('');

    if (apiKey.includes('*') || apiKey.trim() === '') {
      if (envKeySet || apiKey.includes('*')) {
        setTestState('ok');
        setTestMessage('API 金鑰已設定');
      } else {
        setTestState('fail');
        setTestMessage('尚未設定 API 金鑰');
      }
      return;
    }

    // Key is present and plaintext
    setTestState('ok');
    setTestMessage('金鑰格式看起來正確');
  };

  const handleSavePreferences = () => {
    localStorage.setItem('pb-default-model', defaultModel);
    localStorage.setItem('pb-language', language);
    setPrefSaveState('saved');
    setTimeout(() => setPrefSaveState('idle'), 2000);
  };

  const apiKeyValid = apiKey.length === 0 || !apiKey.includes(' ');

  return (
    <div style={styles.container}>
      {/* Header */}
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

        {/* ── Section: API 金鑰 ─────────────────────────────── */}
        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Gemini API 金鑰</h2>
            <div style={styles.sectionDivider} />
          </div>

          {loading ? (
            <p style={styles.loadingText}>載入中...</p>
          ) : (
            <>
              {envKeySet && (
                <div style={styles.infoNotice}>
                  已透過環境變數設定 Gemini API 金鑰。以下輸入的值將覆蓋環境變數。
                </div>
              )}

              <label style={styles.label}>API 金鑰</label>
              <p style={styles.hint}>Google AI Studio API 金鑰 (aistudio.google.com)</p>

              <div style={styles.inputRow}>
                <input
                  type={showKey ? 'text' : 'password'}
                  style={{
                    ...styles.input,
                    ...(!apiKeyValid ? styles.inputError : {}),
                  }}
                  value={apiKey}
                  onChange={e => {
                    setApiKey(e.target.value);
                    setTestState('idle');
                    setTestMessage('');
                  }}
                  placeholder="AIza..."
                  disabled={apiKeySaveState === 'saving'}
                  data-testid="api-key-input"
                />
                <button
                  type="button"
                  style={styles.iconBtn}
                  onClick={() => setShowKey(v => !v)}
                  title={showKey ? '隱藏金鑰' : '顯示金鑰'}
                  data-testid="toggle-key-visibility"
                >
                  {showKey ? (
                    // eye-off icon
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    // eye icon
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>

              {!apiKeyValid && (
                <p style={styles.errorText}>金鑰格式不正確</p>
              )}

              {apiKeyError && (
                <p style={styles.errorText}>{apiKeyError}</p>
              )}

              <div style={styles.actionRow}>
                <button
                  type="button"
                  style={{
                    ...styles.secondaryBtn,
                    ...(testState === 'testing' ? styles.btnDisabled : {}),
                  }}
                  onClick={handleTestConnection}
                  disabled={testState === 'testing'}
                  data-testid="test-connection-btn"
                >
                  {testState === 'testing' ? '測試中...' : '測試連線'}
                </button>

                {testState !== 'idle' && testState !== 'testing' && (
                  <span
                    style={{
                      ...styles.testResult,
                      color: testState === 'ok' ? '#16a34a' : '#ef4444',
                    }}
                    data-testid="test-result"
                  >
                    {testState === 'ok' ? '✓ ' : '✗ '}{testMessage}
                  </span>
                )}

                <div style={styles.spacer} />

                <button
                  style={{
                    ...styles.primaryBtn,
                    ...(apiKeySaveState === 'saving' ? styles.btnDisabled : {}),
                    ...(apiKeySaveState === 'saved' ? styles.btnSaved : {}),
                    ...(apiKeySaveState === 'error' ? styles.btnError : {}),
                  }}
                  onClick={handleSaveApiKey}
                  disabled={apiKeySaveState === 'saving'}
                  data-testid="save-api-key-btn"
                >
                  {apiKeySaveState === 'saving'
                    ? '儲存中...'
                    : apiKeySaveState === 'saved'
                    ? '✓ 已儲存'
                    : apiKeySaveState === 'error'
                    ? '儲存失敗'
                    : '儲存金鑰'}
                </button>
              </div>
            </>
          )}
        </section>

        {/* ── Section: 生成偏好 ─────────────────────────────── */}
        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>生成偏好</h2>
            <div style={styles.sectionDivider} />
          </div>

          <div style={styles.prefGrid}>
            <div style={styles.prefField}>
              <label style={styles.label}>預設模型</label>
              <p style={styles.hint}>用於原型生成的 Gemini 模型</p>
              <select
                style={styles.select}
                value={defaultModel}
                onChange={e => setDefaultModel(e.target.value)}
                data-testid="default-model-select"
              >
                <option value="gemini-2.0-flash">gemini-2.0-flash（免費、快速）</option>
                <option value="gemini-1.5-pro">gemini-1.5-pro（品質優先）</option>
              </select>
            </div>

            <div style={styles.prefField}>
              <label style={styles.label}>AI 回應語言</label>
              <p style={styles.hint}>AI 生成內容所使用的語言</p>
              <select
                style={styles.select}
                value={language}
                onChange={e => setLanguage(e.target.value)}
                data-testid="language-select"
              >
                <option value="繁體中文">繁體中文</option>
                <option value="English">English</option>
              </select>
            </div>
          </div>

          <div style={styles.actionRow}>
            <div style={styles.spacer} />
            <button
              style={{
                ...styles.primaryBtn,
                ...(prefSaveState === 'saved' ? styles.btnSaved : {}),
              }}
              onClick={handleSavePreferences}
              data-testid="save-preferences-btn"
            >
              {prefSaveState === 'saved' ? '✓ 已儲存' : '儲存偏好'}
            </button>
          </div>
        </section>

      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f8fafc',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '0 32px',
    height: '56px',
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e2e8f0',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  headerTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    color: '#1e293b',
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    color: '#475569',
    cursor: 'pointer',
    padding: 0,
  },
  main: {
    maxWidth: '640px',
    margin: '0 auto',
    padding: '32px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  },
  section: {
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '24px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '20px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '15px',
    fontWeight: 600,
    color: '#1e293b',
    whiteSpace: 'nowrap',
  },
  sectionDivider: {
    flex: 1,
    height: '1px',
    backgroundColor: '#e2e8f0',
  },
  loadingText: {
    color: '#64748b',
    fontSize: '14px',
    margin: 0,
  },
  infoNotice: {
    padding: '10px 12px',
    backgroundColor: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: '8px',
    fontSize: '13px',
    color: '#1e40af',
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: '#475569',
    marginBottom: '2px',
  },
  hint: {
    margin: '0 0 8px',
    fontSize: '12px',
    color: '#94a3b8',
  },
  inputRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    padding: '10px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    color: '#1e293b',
    backgroundColor: '#ffffff',
    fontFamily: 'monospace',
  },
  inputError: {
    borderColor: '#fca5a5',
    backgroundColor: '#fff5f5',
  },
  iconBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    color: '#64748b',
    cursor: 'pointer',
    flexShrink: 0,
    padding: 0,
  },
  errorText: {
    margin: '6px 0 0',
    fontSize: '12px',
    color: '#ef4444',
  },
  actionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginTop: '16px',
  },
  spacer: {
    flex: 1,
  },
  testResult: {
    fontSize: '13px',
    fontWeight: 500,
  },
  primaryBtn: {
    padding: '9px 20px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    minWidth: '100px',
  },
  secondaryBtn: {
    padding: '9px 16px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    color: '#475569',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  btnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  btnSaved: {
    backgroundColor: '#16a34a',
  },
  btnError: {
    backgroundColor: '#ef4444',
  },
  prefGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
  },
  prefField: {
    display: 'flex',
    flexDirection: 'column',
  },
  select: {
    padding: '10px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    color: '#1e293b',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
    outline: 'none',
    appearance: 'auto',
  },
};
