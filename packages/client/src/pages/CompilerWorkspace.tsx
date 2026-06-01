import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useCompilerStore } from '../stores/useCompilerStore';
import { useViewport, type LayoutMode } from '../utils/useViewport';
import StageTabs from '../components/compiler/StageTabs';
import ArtifactRail from '../components/compiler/ArtifactRail';
import CompilerChat from '../components/compiler/CompilerChat';
import PreviewPane from '../components/compiler/PreviewPane';
import InspectorPane from '../components/compiler/InspectorPane';
import ThemeMergeDialog from '../components/compiler/ThemeMergeDialog';

const columnBorder = '1px solid var(--border-primary)';

type MobilePane = 'rail' | 'chat' | 'preview' | 'inspector';

const RAIL_WIDTH: Record<LayoutMode, number> = { desktop: 220, compact: 200, mobile: 0 };
const CHAT_WIDTH: Record<LayoutMode, number | string> = { desktop: 360, compact: 320, mobile: '100%' };
const INSPECTOR_WIDTH: Record<LayoutMode, number> = { desktop: 380, compact: 340, mobile: 0 };

const MOBILE_LABEL: Record<MobilePane, string> = {
  rail: '產出',
  chat: '對話',
  preview: '預覽',
  inspector: '檢視',
};

const ICON_BTN: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: 14,
  borderRadius: 8,
  border: '1px solid var(--border-accent)',
  background: 'var(--bg-card)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  lineHeight: 1,
  transition: 'background 160ms, border-color 160ms',
};

function shortProjectLabel(id: string | undefined): string {
  if (!id) return '未命名專案';
  // UUID v4: 8-4-4-4-12. Show first 8 + "…" for compact identifier.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return `專案 ${id.slice(0, 8)}`;
  }
  return id;
}

/** AI UI 編譯器工作區。
 *  響應式：
 *  - desktop (≥1280px)：產出列 | 對話 | 預覽 | 檢視，四欄全顯
 *  - compact (768–1280px)：產出列/檢視欄預設收合，header 切換按鈕展開
 *  - mobile (<768px)：底部 tab nav 切換單一面板
 */
export default function CompilerWorkspace() {
  const { id } = useParams();
  const projectId = useCompilerStore((s) => s.projectId);
  const pendingThemeProposal = useCompilerStore((s) => s.pendingThemeProposal);
  const applyThemeMergeAction = useCompilerStore((s) => s.applyThemeMergeAction);
  const clearPendingThemeProposal = useCompilerStore((s) => s.clearPendingThemeProposal);

  const { mode } = useViewport();
  const [railOpen, setRailOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [mobilePane, setMobilePane] = useState<MobilePane>('chat');

  useEffect(() => {
    if (id) useCompilerStore.getState().setProjectId(id);
  }, [id]);

  useEffect(() => {
    if (mode === 'desktop') {
      setRailOpen(true);
      setInspectorOpen(true);
    } else if (mode === 'compact') {
      setRailOpen(false);
      setInspectorOpen(false);
    }
  }, [mode]);

  const showRail = mode === 'mobile' ? mobilePane === 'rail' : railOpen;
  const showChat = mode === 'mobile' ? mobilePane === 'chat' : true;
  const showPreview = mode === 'mobile' ? mobilePane === 'preview' : true;
  const showInspector = mode === 'mobile' ? mobilePane === 'inspector' : inspectorOpen;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'var(--bg-root, var(--bg-primary))',
        color: 'var(--text-primary)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: mode === 'mobile' ? 8 : 14,
          padding: '10px 16px',
          borderBottom: columnBorder,
          background: 'var(--glass-floating, var(--bg-secondary))',
          backdropFilter: 'var(--glass-blur-md, none)',
          flexShrink: 0,
          flexWrap: mode === 'mobile' ? 'wrap' : 'nowrap',
        }}
      >
        {mode !== 'mobile' && (
          <button
            type="button"
            aria-label="切換產出列"
            aria-pressed={railOpen}
            onClick={() => setRailOpen((o) => !o)}
            style={ICON_BTN}
            title={railOpen ? '隱藏產出列' : '展開產出列'}
          >
            📁
          </button>
        )}
        <div
          title={projectId || ''}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            color: 'var(--text-accent, var(--text-primary))',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              background: 'linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              color: '#fff',
            }}
          >
            ⌘
          </span>
          {shortProjectLabel(projectId)}
        </div>
        <div style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>
          <StageTabs />
        </div>
        {mode !== 'mobile' && (
          <button
            type="button"
            aria-label="切換檢視欄"
            aria-pressed={inspectorOpen}
            onClick={() => setInspectorOpen((o) => !o)}
            style={ICON_BTN}
            title={inspectorOpen ? '隱藏檢視欄' : '展開檢視欄'}
          >
            🔍
          </button>
        )}
        <Link
          to="/settings"
          style={{
            fontSize: 13,
            color: 'var(--text-accent, var(--accent))',
            whiteSpace: 'nowrap',
            textDecoration: 'none',
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid transparent',
            transition: 'background 160ms, border-color 160ms',
          }}
        >
          {mode === 'mobile' ? '⚙' : '⚙ 設定'}
        </Link>
      </header>

      {mode === 'mobile' && (
        <nav
          role="tablist"
          aria-label="工作區面板"
          style={{
            display: 'flex',
            borderBottom: columnBorder,
            background: 'var(--bg-secondary)',
            flexShrink: 0,
          }}
        >
          {(['rail', 'chat', 'preview', 'inspector'] as const).map((p) => {
            const active = mobilePane === p;
            return (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMobilePane(p)}
                style={{
                  flex: 1,
                  padding: '10px 4px',
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  border: 'none',
                  borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                  background: 'transparent',
                  color: active ? 'var(--text-accent, var(--accent))' : 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                {MOBILE_LABEL[p]}
              </button>
            );
          })}
        </nav>
      )}

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <aside
          aria-hidden={!showRail}
          style={{
            width: showRail ? RAIL_WIDTH[mode] : 0,
            borderRight: showRail && mode !== 'mobile' ? columnBorder : 'none',
            overflow: 'auto',
            flexShrink: 0,
            transition: 'width 180ms ease',
            background: 'var(--bg-primary)',
            ...(mode === 'mobile' && showRail ? { flex: 1, width: '100%' } : {}),
          }}
        >
          <ArtifactRail />
        </aside>

        <section
          aria-hidden={!showChat}
          style={{
            width: showChat ? CHAT_WIDTH[mode] : 0,
            borderRight: showChat && mode !== 'mobile' ? columnBorder : 'none',
            overflow: 'hidden',
            flexShrink: 0,
            display: 'flex',
            background: 'var(--bg-secondary)',
            ...(mode === 'mobile' && !showChat ? { display: 'none' } : {}),
            ...(mode === 'mobile' && showChat ? { flex: 1, width: '100%' } : {}),
          }}
        >
          <CompilerChat />
        </section>

        <main
          aria-hidden={!showPreview}
          style={{
            flex: showPreview ? 1 : 0,
            minWidth: 0,
            overflow: 'hidden',
            display: showPreview ? 'flex' : 'none',
            background: 'var(--bg-primary)',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <PreviewPane />
          </div>
        </main>

        <aside
          aria-hidden={!showInspector}
          style={{
            width: showInspector ? INSPECTOR_WIDTH[mode] : 0,
            borderLeft: showInspector && mode !== 'mobile' ? columnBorder : 'none',
            overflow: 'auto',
            flexShrink: 0,
            transition: 'width 180ms ease',
            background: 'var(--bg-secondary)',
            ...(mode === 'mobile' && showInspector ? { flex: 1, width: '100%' } : {}),
          }}
        >
          <InspectorPane />
        </aside>
      </div>

      {pendingThemeProposal && (
        <ThemeMergeDialog
          current={null}
          proposal={pendingThemeProposal}
          onApply={(choice) => void applyThemeMergeAction(choice)}
          onCancel={clearPendingThemeProposal}
        />
      )}
    </div>
  );
}
