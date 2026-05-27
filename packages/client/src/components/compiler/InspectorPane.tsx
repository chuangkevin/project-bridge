import { useCompilerStore } from '../../stores/useCompilerStore';

const emptyStyle = { padding: 16, fontSize: 13, color: 'var(--text-muted, #94a3b8)' } as const;
const preStyle = {
  margin: 0,
  padding: 12,
  fontSize: 12,
  overflow: 'auto',
  height: '100%',
  background: 'var(--bg-secondary, #fff)',
  color: 'var(--text-primary, #1e293b)',
} as const;

/** Right-hand detail pane. AST tree / violations / generated code, keyed to the active stage. */
export default function InspectorPane() {
  const artifacts = useCompilerStore((s) => s.artifacts);
  const activeArtifactId = useCompilerStore((s) => s.activeArtifactId);
  const stage = useCompilerStore((s) => s.stage);
  const active = artifacts.find((a) => a.id === activeArtifactId);

  if (!active) {
    return <div style={emptyStyle}>No artifact selected.</div>;
  }

  if (stage === 'codegen') {
    const copy = () => {
      navigator.clipboard?.writeText(active.vue.code);
    };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ padding: 8, borderBottom: '1px solid var(--border-primary, #e2e8f0)' }}>
          <button
            type="button"
            onClick={copy}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid var(--border-primary, #e2e8f0)',
              cursor: 'pointer',
              background: 'var(--bg-secondary, #fff)',
              color: 'var(--text-primary, #1e293b)',
            }}
          >
            Copy
          </button>
        </div>
        <pre style={{ ...preStyle, flex: 1, height: 'auto' }}>{active.vue.code}</pre>
      </div>
    );
  }

  if (stage === 'constraint') {
    if (active.violations.length === 0) {
      return <div style={{ ...emptyStyle, color: 'var(--text-secondary, #64748b)' }}>No violations.</div>;
    }
    return (
      <ul style={{ margin: 0, padding: 12, paddingLeft: 28, fontSize: 13, overflow: 'auto', height: '100%' }}>
        {active.violations.map((v, i) => (
          <li key={`${v.ruleId}-${v.nodeId}-${i}`} style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 600, color: v.severity === 'error' ? '#dc2626' : '#d97706' }}>
              {v.ruleId} ({v.severity})
            </div>
            <div style={{ color: 'var(--text-secondary, #64748b)' }}>node: {v.nodeId}</div>
            <div style={{ color: 'var(--text-primary, #1e293b)' }}>{v.message}</div>
          </li>
        ))}
      </ul>
    );
  }

  // 'ingestion' | 'ast' — read-only AST tree (v1)
  return <pre style={preStyle}>{JSON.stringify(active.ast, null, 2)}</pre>;
}
