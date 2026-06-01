import { useState, type CSSProperties, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';

export default function SetupPage() {
  const setup = useAuthStore((s) => s.setup);
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    try { await setup({ name, email, password }); navigate('/projects'); }
    catch (e) { setErr((e as Error).message); }
  };

  return (
    <form onSubmit={submit} style={form}>
      <h1>初次安裝</h1>
      <input placeholder="姓名" value={name} onChange={(e) => setName(e.target.value)} required style={input} />
      <input placeholder="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={input} />
      <input placeholder="密碼（>= 8 字）" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} style={input} />
      {err && <div style={{ color: '#fca5a5' }}>{err}</div>}
      <button type="submit" style={btn}>建立並登入</button>
    </form>
  );
}

const form: CSSProperties = { maxWidth: 360, margin: '80px auto', display: 'flex', flexDirection: 'column', gap: 12, padding: 24, background: 'var(--bg-card)', borderRadius: 12 };
const input: CSSProperties = { padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-input)', color: 'var(--text-primary)' };
const btn: CSSProperties = { padding: '10px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))', color: '#fff', cursor: 'pointer', fontWeight: 600 };
