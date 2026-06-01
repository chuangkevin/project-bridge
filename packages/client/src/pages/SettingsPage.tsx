import { useState } from 'react';
import { Link } from 'react-router-dom';
import ProvidersTab from './settings/ProvidersTab';
import SkillsTab from './settings/SkillsTab';
import AboutTab from './settings/AboutTab';

type Tab = 'providers' | 'skills' | 'about';

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('providers');
  return (
    <div className="settings">
      <header className="settings__header">
        <Link to="/projects" style={{ color: 'var(--text-muted)', fontSize: 13 }}>← 專案</Link>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>設定</h1>
      </header>
      <nav className="settings__tabs" role="tablist">
        <button className="settings__tab" aria-pressed={tab === 'providers'} onClick={() => setTab('providers')}>AI 供應商</button>
        <button className="settings__tab" aria-pressed={tab === 'skills'} onClick={() => setTab('skills')}>技能庫</button>
        <button className="settings__tab" aria-pressed={tab === 'about'} onClick={() => setTab('about')}>關於</button>
      </nav>
      <div className="settings__body">
        {tab === 'providers' && <ProvidersTab />}
        {tab === 'skills' && <SkillsTab />}
        {tab === 'about' && <AboutTab />}
      </div>
    </div>
  );
}
