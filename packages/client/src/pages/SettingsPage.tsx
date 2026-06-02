import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ProvidersTab from './settings/ProvidersTab';
import McpTab from './settings/McpTab';
import SkillsTab from './settings/SkillsTab';
import UsersTab from './settings/UsersTab';
import AboutTab from './settings/AboutTab';

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

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>(readInitialTab);

  useEffect(() => {
    localStorage.setItem(TAB_STORAGE_KEY, tab);
    if (window.location.hash !== `#${tab}`) {
      window.history.replaceState(null, '', `#${tab}`);
    }
  }, [tab]);

  return (
    <div className="settings">
      <header className="settings__header">
        <Link to="/projects" style={{ color: 'var(--text-muted)', fontSize: 13 }}>← 專案</Link>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>設定</h1>
      </header>
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
