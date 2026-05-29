import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useCompilerStore } from '../stores/useCompilerStore';
import StageTabs from '../components/compiler/StageTabs';
import ArtifactRail from '../components/compiler/ArtifactRail';
import CompilerChat from '../components/compiler/CompilerChat';
import PreviewPane from '../components/compiler/PreviewPane';
import InspectorPane from '../components/compiler/InspectorPane';
import ThemeMergeDialog from '../components/compiler/ThemeMergeDialog';

const columnBorder = '1px solid var(--border-primary, #e2e8f0)';

/** AI UI Compiler workspace: a 4-column shell (rail | chat | preview | inspector)
 *  with a stage-tab topbar. Not yet routed — wiring into App.tsx is a later phase. */
export default function CompilerWorkspace() {
  const { id } = useParams();
  const projectId = useCompilerStore((s) => s.projectId);
  const pendingThemeProposal = useCompilerStore((s) => s.pendingThemeProposal);
  const applyThemeMergeAction = useCompilerStore((s) => s.applyThemeMergeAction);
  const clearPendingThemeProposal = useCompilerStore((s) => s.clearPendingThemeProposal);

  useEffect(() => {
    if (id) useCompilerStore.getState().setProjectId(id);
  }, [id]);

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
          gap: 16,
          padding: '8px 16px',
          borderBottom: columnBorder,
          background: 'var(--bg-secondary, #fff)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600 }}>Project: {projectId || '—'}</span>
        <StageTabs />
        <Link to="/settings" style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--accent, #8E6FA7)' }}>
          Settings
        </Link>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <aside style={{ width: 200, borderRight: columnBorder, overflow: 'auto', flexShrink: 0 }}>
          <ArtifactRail />
        </aside>
        <section style={{ width: 320, borderRight: columnBorder, overflow: 'hidden', flexShrink: 0, display: 'flex' }}>
          <CompilerChat />
        </section>
        <main style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <PreviewPane />
          </div>
        </main>
        <aside style={{ width: 360, borderLeft: columnBorder, overflow: 'auto', flexShrink: 0 }}>
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
