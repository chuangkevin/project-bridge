import { useCompilerStore } from '../../stores/useCompilerStore';
import { buildPreviewHtml } from '../../lib/previewHtml';

const emptyStyle = { padding: 16, fontSize: 13, color: 'var(--text-muted, #94a3b8)' } as const;

/** The central preview anchor. What it renders depends on the active pipeline stage. */
export default function PreviewPane() {
  const artifacts = useCompilerStore((s) => s.artifacts);
  const activeArtifactId = useCompilerStore((s) => s.activeArtifactId);
  const stage = useCompilerStore((s) => s.stage);
  const active = artifacts.find((a) => a.id === activeArtifactId);

  if (!active) {
    return <div style={emptyStyle}>Describe a UI in chat to compile it.</div>;
  }

  if (stage === 'codegen') {
    return (
      <pre
        style={{
          margin: 0,
          padding: 12,
          fontSize: 12,
          overflow: 'auto',
          height: '100%',
          background: 'var(--bg-secondary, #fff)',
          color: 'var(--text-primary, #1e293b)',
        }}
      >
        {active.vue.code}
      </pre>
    );
  }

  if (stage === 'constraint') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ padding: 8, borderBottom: '1px solid var(--border-primary, #e2e8f0)', overflow: 'auto', maxHeight: '40%' }}>
          {active.violations.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)' }}>No rule violations.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {active.violations.map((v, i) => (
                <li key={`${v.ruleId}-${v.nodeId}-${i}`} style={{ color: v.severity === 'error' ? '#dc2626' : '#d97706' }}>
                  {v.ruleId} — {v.message} ({v.severity})
                </li>
              ))}
            </ul>
          )}
        </div>
        <iframe
          title="preview"
          sandbox="allow-scripts"
          srcDoc={buildPreviewHtml(active.vue.code)}
          style={{ width: '100%', flex: 1, border: 'none', background: '#fff' }}
        />
      </div>
    );
  }

  // 'ingestion' | 'ast'
  return (
    <iframe
      title="preview"
      sandbox="allow-scripts"
      srcDoc={buildPreviewHtml(active.vue.code)}
      style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
    />
  );
}
