import { useEffect } from 'react';
import { useAuthStore } from './stores/useAuthStore';

export default function App() {
  const { user, loading, hydrate, logout } = useAuthStore();
  useEffect(() => { void hydrate(); }, [hydrate]);

  if (loading) return <div style={{ padding: 24 }}>載入中…</div>;

  return (
    <div style={{ padding: 24 }}>
      {user ? (
        <>
          <h1>Hello, {user.name}</h1>
          <p>{user.email}</p>
          <button onClick={() => void logout()}>登出</button>
        </>
      ) : (
        <p>尚未登入</p>
      )}
    </div>
  );
}
