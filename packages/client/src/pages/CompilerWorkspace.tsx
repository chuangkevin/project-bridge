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

const columnBorder = '1px solid var(--border-primary, #e2e8f0)';

type MobilePane = 'rail' | 'chat' | 'preview' | 'inspector';

const RAIL_WIDTH: Record<LayoutMode, number> = { desktop: 200, compact: 180, mobile: 0 };
const CHAT_WIDTH: Record<LayoutMode, number | string> = { desktop: 320, compact: 280, mobile: '100%' };
const INSPECTOR_WIDTH: Record<LayoutMode, number> = { desktop: 360, compact: 320, mobile: 0 };

const ICON_BTN: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: 14,
  borderRadius: 6,
  border: '1px solid var(--border-primary, #e2e8f0)',
  background: 'var(--bg-secondary, #fff)',
  color: 'var(--text-primary, #1e293b)',
  cursor: 'pointer',
  lineHeight: 1,
};

/** AI UI Compiler workspace.
 *  Layout adapts to viewport:
 *  - desktop (≥1280): rail | chat | preview | inspector, all visible
 *  - compact (768–1280): rail/inspector collapsible (default closed) via header toggles
 *  - mobile (<768): tab nav switches one pane at a time
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
  const [mobilePane, setMobilePane] = useState<MobilePane>('preview');

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
        background: 'var(--bg-primary, #f8fafc)',
        color: 'var(--text-primary, #1e293b)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: mode === 'mobile' ? 8 : 12,
          padding: '8px 12px',
          borderBottom: columnBorder,
          background: 'var(--bg-secondary, #fff)',
          flexShrink: 0,
          flexWrap: mode === 'mobile' ? 'wrap' : 'nowrap',
        }}
      >
        {mode !== 'mobile' && (
          <button
            type="button"
            aria-label="Toggle artifact rail"
            aria-pressed={railOpen}
            onClick={() => setRailOpen((o) => !o)}
            style={ICON_BTN}
            title={railOpen ? 'Hide artifacts' : 'Show artifacts'}
          >
            📁
          </button>
        )}
        <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
          {mode === 'mobile' ? projectId || '—' : `Project: ${projectId || '—'}`}
        </span>
        <div style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>
          <StageTabs />
        </div>
        {mode !== 'mobile' && (
          <button
            type="button"
            aria-label="Toggle inspector"
            aria-pressed={inspectorOpen}
            onClick={() => setInspectorOpen((o) => !o)}
            style={ICON_BTN}
            title={inspectorOpen ? 'Hide inspector' : 'Show inspector'}
          >
            🔍
          </button>
        )}
        <Link
          to="/settings"
          style={{ fontSize: 13, color: 'var(--accent, #8E6FA7)', whiteSpace: 'nowrap' }}
        >
          {mode === 'mobile' ? '⚙' : 'Settings'}
        </Link>
      </header>

      {mode === 'mobile' && (
        <nav
          role="tablist"
          aria-label="Workspace pane"
          style={{
            display: 'flex',
            borderBottom: columnBorder,
            background: 'var(--bg-secondary, #fff)',
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
                  padding: '8px 4px',
                  fontSize: 12,
                  fontWeight: active ? 600 : 400,
                  border: 'none',
                  borderBottom: active ? '2px solid var(--accent, #8E6FA7)' : '2px solid transparent',
                  background: 'transparent',
                  color: active ? 'var(--accent, #8E6FA7)' : 'var(--text-secondary, #64748b)',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {p === 'rail' ? 'Files' : p}
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
