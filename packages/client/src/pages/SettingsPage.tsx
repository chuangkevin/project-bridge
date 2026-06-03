import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ProvidersTab from './settings/ProvidersTab';
import McpTab from './settings/McpTab';
import SkillsTab from './settings/SkillsTab';
import UsersTab from './settings/UsersTab';
import AboutTab from './settings/AboutTab';
import PresetsTab from './settings/PresetsTab';

type Tab = 'providers' | 'mcp' | 'skills' | 'users' | 'about' | 'presets';

const TAB_STORAGE_KEY = 'designbridge.settings.tab';
const VALID_TABS: Tab[] = ['providers', 'mcp', 'skills', 'users', 'about', 'presets'];

function readInitialTab(): Tab {
  const fromHash = window.location.hash.replace('#', '') as Tab;
  if (VALID_TABS.includes(fromHash)) return fromHash;
  const stored = localStorage.getItem(TAB_STORAGE_KEY) as Tab | null;
  if (stored && VALID_TABS.includes(stored)) return stored;
  return 'providers';
}

/**
 * Settings page — anonymous, no auth gate.
 *
 * Per user instruction: zero login / password anywhere. Settings is open
 * just like the rest of the product. The admin-password machinery is kept
 * on the server side (services/adminAuth.ts) for optional future use but
 * NOT enforced. The 5 tabs render immediately for anyone.
 */
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
        <button className="settings__tab" aria-pressed={tab === 'presets'} onClick={() => setTab('presets')}>設計預設</button>
      </nav>
      <div className="settings__body">
        {tab === 'providers' && <ProvidersTab />}
        {tab === 'mcp' && <McpTab />}
        {tab === 'skills' && <SkillsTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'about' && <AboutTab />}
        {tab === 'presets' && <PresetsTab />}
      </div>
    </div>
  );
}
