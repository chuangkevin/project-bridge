import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import ProvidersTab from './settings/ProvidersTab';
import McpTab from './settings/McpTab';
import SkillsTab from './settings/SkillsTab';
import UsersTab from './settings/UsersTab';
import AboutTab from './settings/AboutTab';
import { useAuthStore } from '../stores/useAuthStore';

type Tab = 'providers' | 'mcp' | 'skills' | 'users' | 'about';

const TAB_STORAGE_KEY = 'designbridge.settings.tab';
const VALID_TABS: Tab[] = ['providers', 'mcp', 'skills', 'users', 'about'];

function readInitialTab(): Tab {
  const fromHash = window.location.hash.replace('#', '') as Tab;
  if (VALID_TABS.includes(fromHash)) return fromHash;
  const stored = localStorage.getItem(TAB_STORAGE_KEY) as Tab | null;
  if (stored && VALID_TABS.includes(stored)) return stored;
  return 'providers';
}

/**
 * Settings page (M1 anonymous mode).
 *
 * Gate flow:
 *   1. On mount, refresh adminStatus via GET /api/auth/status.
 *   2. If hasAdminPassword=false → show a one-time setup form.
 *   3. If hasAdminPassword=true and no admin token in sessionStorage → show
 *      password prompt; verify mints the token.
 *   4. Once we have a token, render the 5 tabs.
 *
 * The About tab is always visible (read-only info, no admin secrets), so the
 * user can find their way back / read about the system even without a password.
 */
export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>(readInitialTab);
  const { adminToken, adminStatus, refreshAdminStatus, setupAdmin, verifyAdmin, clearAdmin } = useAuthStore();

  useEffect(() => {
    localStorage.setItem(TAB_STORAGE_KEY, tab);
    if (window.location.hash !== `#${tab}`) {
      window.history.replaceState(null, '', `#${tab}`);
    }
  }, [tab]);

  useEffect(() => { void refreshAdminStatus(); }, [refreshAdminStatus]);

  if (adminStatus === 'unknown') {
    return (
      <div className="settings">
        <SettingsHeader />
        <div className="settings__body" style={{ padding: 24 }}>載入中…</div>
      </div>
    );
  }

  if (adminStatus === 'unset') {
    return (
      <div className="settings">
        <SettingsHeader />
        <div className="settings__body" style={{ padding: 24 }}>
          <AdminSetupForm onDone={() => { void refreshAdminStatus(); }} onSubmit={setupAdmin} />
        </div>
      </div>
    );
  }

  if (!adminToken) {
    return (
      <div className="settings">
        <SettingsHeader />
        <div className="settings__body" style={{ padding: 24 }}>
          <AdminVerifyForm onSubmit={verifyAdmin} />
        </div>
      </div>
    );
  }

  return (
    <div className="settings">
      <SettingsHeader rightAccessory={
        <button onClick={() => { void clearAdmin(); }} style={ghostBtn}>登出管理員</button>
      } />
      <nav className="settings__tabs" role="tablist">
        <button className="settings__tab" aria-pressed={tab === 'providers'} onClick={() => setTab('providers')}>AI 供應商</button>
        <button className="settings__tab" aria-pressed={tab === 'mcp'} onClick={() => setTab('mcp')}>MCP Servers</button>
        <button className="settings__tab" aria-pressed={tab === 'skills'} onClick={() => setTab('skills')}>技能庫</button>
        <button className="settings__tab" aria-pressed={tab === 'users'} onClick={() => setTab('users')}>使用者</button>
        <button className="settings__tab" aria-pressed={tab === 'about'} onClick={() => setTab('about')}>關於</button>
      </nav>
      <div className="settings__body">
        {tab === 'providers' && <ProvidersTab />}
        {tab === 'mcp' && <McpTab />}
        {tab === 'skills' && <SkillsTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'about' && <AboutTab />}
      </div>
    </div>
  );
}

function SettingsHeader({ rightAccessory }: { rightAccessory?: React.ReactNode }) {
  return (
    <header className="settings__header">
      <Link to="/projects" style={{ color: 'var(--text-muted)', fontSize: 13 }}>← 專案</Link>
      <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>設定</h1>
      {rightAccessory && <div style={{ marginLeft: 'auto' }}>{rightAccessory}</div>}
    </header>
  );
}

function AdminSetupForm({ onDone, onSubmit }: { onDone: () => void; onSubmit: (pw: string) => Promise<void> }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8) { setErr('密碼至少 8 字'); return; }
    if (pw !== pw2) { setErr('兩次輸入不一致'); return; }
    setBusy(true);
    try {
      await onSubmit(pw);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={panel}>
      <h2 style={{ margin: 0, fontSize: 16 }}>初次設定管理員密碼</h2>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
        這把密碼用來保護 API key、MCP、使用者管理等管理員操作。網站本身對任何人都是開放的，不需要登入。
      </p>
      <input type="password" placeholder="新密碼（>= 8 字）" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} style={input} />
      <input type="password" placeholder="再輸入一次" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={8} style={input} />
      {err && <div style={{ color: '#fca5a5', fontSize: 12 }}>{err}</div>}
      <button type="submit" disabled={busy} style={btn}>{busy ? '處理中…' : '設定密碼'}</button>
    </form>
  );
}

function AdminVerifyForm({ onSubmit }: { onSubmit: (pw: string) => Promise<void> }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try { await onSubmit(pw); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} style={panel}>
      <h2 style={{ margin: 0, fontSize: 16 }}>輸入管理員密碼</h2>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
        Settings 內的設定操作需要管理員密碼驗證。網站其他功能（建立專案、對話、生成）不需要登入。
      </p>
      <input type="password" placeholder="管理員密碼" value={pw} onChange={(e) => setPw(e.target.value)} required style={input} autoFocus />
      {err && <div style={{ color: '#fca5a5', fontSize: 12 }}>{err}</div>}
      <button type="submit" disabled={busy} style={btn}>{busy ? '驗證中…' : '確認'}</button>
    </form>
  );
}

const panel: CSSProperties = {
  maxWidth: 360,
  margin: '40px auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 24,
  background: 'var(--bg-card)',
  borderRadius: 12,
};
const input: CSSProperties = { padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-input)', color: 'var(--text-primary)' };
const btn: CSSProperties = { padding: '10px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))', color: '#fff', cursor: 'pointer', fontWeight: 600 };
const ghostBtn: CSSProperties = { padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 };
