import { Link } from 'react-router-dom';
import GlobalStyleTab from './settings/GlobalStyleTab';

/** /global-design — same content as 設定 → 全域風格 tab.
 *  Kept as a standalone route for direct links; the tab is the canonical home. */
export default function GlobalDesignPage() {
  return (
    <div className="settings">
      <header className="settings__header">
        <Link to="/projects" style={{ color: 'var(--text-muted)', fontSize: 13 }}>← 專案</Link>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>全域風格</h1>
      </header>
      <div className="settings__body">
        <GlobalStyleTab />
      </div>
    </div>
  );
}
