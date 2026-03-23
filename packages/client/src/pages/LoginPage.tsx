import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface UserEntry {
  id: string;
  name: string;
  role: 'admin' | 'user';
  is_active: boolean;
}

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
    margin: '0 0 24px 0',
  } as React.CSSProperties,
  userList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
  } as React.CSSProperties,
  userButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: 500,
    color: '#1e293b',
    transition: 'background-color 0.15s, border-color 0.15s',
  } as React.CSSProperties,
  userName: {
    fontSize: '15px',
    fontWeight: 500,
    color: '#1e293b',
  } as React.CSSProperties,
  roleBadge: {
    fontSize: '12px',
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: '6px',
  } as React.CSSProperties,
  adminBadge: {
    backgroundColor: '#eff6ff',
    color: '#3b82f6',
  } as React.CSSProperties,
  userBadge: {
    backgroundColor: '#f1f5f9',
    color: '#64748b',
  } as React.CSSProperties,
  error: {
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '14px',
    marginBottom: '16px',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  loading: {
    textAlign: 'center' as const,
    color: '#64748b',
    fontSize: '14px',
    padding: '20px 0',
  } as React.CSSProperties,
};

export default function LoginPage() {
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState('');
  const [loggingIn, setLoggingIn] = useState<string | null>(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/auth/users')
      .then((res) => {
        if (!res.ok) throw new Error('無法載入使用者列表');
        return res.json();
      })
      .then((data: UserEntry[]) => {
        setUsers(data.filter((u) => u.is_active));
      })
      .catch((err) => {
        setError(err.message || '無法載入使用者列表');
      })
      .finally(() => {
        setLoadingUsers(false);
      });
  }, []);

  const handleLogin = async (userId: string) => {
    setError('');
    setLoggingIn(userId);
    try {
      await login(userId);
      navigate('/');
    } catch (err: any) {
      setError(err.message || '登入失敗，請再試一次');
    } finally {
      setLoggingIn(null);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>選擇使用者登入</h1>

        {error && <div style={styles.error}>{error}</div>}

        {loadingUsers ? (
          <div style={styles.loading}>載入中...</div>
        ) : users.length === 0 ? (
          <div style={styles.loading}>目前沒有可用的使用者</div>
        ) : (
          <div style={styles.userList}>
            {users.map((u) => (
              <button
                key={u.id}
                style={{
                  ...styles.userButton,
                  opacity: loggingIn && loggingIn !== u.id ? 0.5 : 1,
                }}
                disabled={loggingIn !== null}
                onClick={() => handleLogin(u.id)}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#f8fafc';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = '#3b82f6';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#fff';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = '#e2e8f0';
                }}
              >
                <span style={styles.userName}>{u.name}</span>
                <span
                  style={{
                    ...styles.roleBadge,
                    ...(u.role === 'admin' ? styles.adminBadge : styles.userBadge),
                  }}
                >
                  {u.role === 'admin' ? '管理員' : '使用者'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
