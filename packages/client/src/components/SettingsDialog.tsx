import { useState, useEffect } from 'react';

interface Props {
  onClose: () => void;
}

export default function SettingsDialog({ onClose }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [envKeySet, setEnvKeySet] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings');
        if (!res.ok) throw new Error('Failed to fetch settings');
        const data = await res.json();
        setEnvKeySet(data.envKeys?.GEMINI_API_KEY ?? false);
        const keySetting = data.settings?.find((s: { key: string }) => s.key === 'gemini_api_key');
        if (keySetting) {
          setApiKey(keySetting.value);
        }
      } catch {
        setMessage({ type: 'error', text: 'Failed to load settings' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'gemini_api_key', value: apiKey }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setMessage({ type: 'success', text: 'API key saved successfully' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to save API key' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.dialog} onClick={e => e.stopPropagation()}>
        <h2 style={styles.title}>Settings</h2>

        {loading ? (
          <p style={styles.loadingText}>Loading...</p>
        ) : (
          <>
            {envKeySet && (
              <div style={styles.envNotice}>
                Gemini API key is set via environment variable. The value below will override it.
              </div>
            )}
            <label style={styles.label}>Gemini API Key</label>
            <input
              type="password"
              style={styles.input}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="AIza..."
              disabled={saving}
            />
            {message && (
              <p style={{ ...styles.message, color: message.type === 'success' ? '#16a34a' : '#ef4444' }}>
                {message.text}
              </p>
            )}
            <div style={styles.actions}>
              <button type="button" style={styles.cancelBtn} onClick={onClose}>
                Close
              </button>
              <button style={styles.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </>
        )}
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
    backgroundColor: '#ffffff',
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
    color: '#1e293b',
  },
  loadingText: {
    color: '#64748b',
    fontSize: '14px',
  },
  envNotice: {
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
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  message: {
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
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    color: '#475569',
    fontSize: '14px',
    cursor: 'pointer',
  },
  saveBtn: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
