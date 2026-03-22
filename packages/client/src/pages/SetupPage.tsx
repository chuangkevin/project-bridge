import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f8fafc',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  } as React.CSSProperties,
  card: {
    backgroundColor: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '32px',
    width: '100%',
    maxWidth: '420px',
  } as React.CSSProperties,
  title: {
    fontSize: '22px',
    fontWeight: 700,
    color: '#1e293b',
    textAlign: 'center' as const,
    margin: '0 0 8px 0',
  } as React.CSSProperties,
  subtitle: {
    fontSize: '14px',
    color: '#64748b',
    textAlign: 'center' as const,
    margin: '0 0 28px 0',
  } as React.CSSProperties,
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  } as React.CSSProperties,
  label: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#334155',
    marginBottom: '6px',
    display: 'block',
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    color: '#1e293b',
    backgroundColor: '#fff',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  primaryBtn: {
    padding: '11px 20px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: '#3b82f6',
    color: '#fff',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '4px',
  } as React.CSSProperties,
  disabledBtn: {
    opacity: 0.6,
    cursor: 'not-allowed',
  } as React.CSSProperties,
  error: {
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '14px',
    textAlign: 'center' as const,
  } as React.CSSProperties,
};

export default function SetupPage() {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { setup } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setError('');
    setSubmitting(true);
    try {
      await setup(trimmed);
      navigate('/');
    } catch (err: any) {
      setError(err.message || '建立管理員失敗，請再試一次');
    } finally {
      setSubmitting(false);
    }
  };

  const isDisabled = submitting || name.trim().length === 0;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>歡迎使用 Project Bridge</h1>
        <p style={styles.subtitle}>建立第一位管理員帳號</p>

        <form style={styles.form} onSubmit={handleSubmit}>
          {error && <div style={styles.error}>{error}</div>}

          <div>
            <label style={styles.label} htmlFor="admin-name">
              管理員名稱
            </label>
            <input
              id="admin-name"
              type="text"
              style={styles.input}
              placeholder="輸入名稱"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              autoFocus
            />
          </div>

          <button
            type="submit"
            style={{
              ...styles.primaryBtn,
              ...(isDisabled ? styles.disabledBtn : {}),
            }}
            disabled={isDisabled}
          >
            {submitting ? '建立中...' : '建立管理員'}
          </button>
        </form>
      </div>
    </div>
  );
}
