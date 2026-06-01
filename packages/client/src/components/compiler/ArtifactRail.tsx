import { useCompilerStore } from '../../stores/useCompilerStore';

/** 垂直清單，顯示已編譯的產出（Mirror / AST）。點擊切換為作用中項目。 */
export default function ArtifactRail() {
  const artifacts = useCompilerStore((s) => s.artifacts);
  const activeArtifactId = useCompilerStore((s) => s.activeArtifactId);
  const selectArtifact = useCompilerStore((s) => s.selectArtifact);

  if (artifacts.length === 0) {
    return (
      <div
        style={{
          padding: '20px 12px',
          fontSize: 12,
          lineHeight: 1.55,
          color: 'var(--text-muted)',
          textAlign: 'center',
          wordBreak: 'break-word',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'var(--accent-glass)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            margin: '0 auto 8px',
          }}
        >
          📦
        </div>
        <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>尚無產出</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '8px 8px 16px' }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          padding: '6px 10px',
        }}
      >
        產出（{artifacts.length}）
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {artifacts.map((a) => {
          const active = a.id === activeArtifactId;
          const label = a.kind === 'mirror' ? a.id : a.ast.artifactId;
          return (
            <li key={a.id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => selectArtifact(a.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid',
                  borderColor: active ? 'var(--border-accent-hi, var(--accent))' : 'var(--border-subtle, transparent)',
                  cursor: 'pointer',
                  fontSize: 13,
                  background: active ? 'var(--accent-glass)' : 'transparent',
                  color: active ? 'var(--text-accent, var(--accent))' : 'var(--text-primary)',
                  fontWeight: active ? 600 : 400,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'background 140ms, border-color 140ms',
                }}
              >
                <span aria-hidden style={{ fontSize: 14, flexShrink: 0 }}>
                  {a.kind === 'mirror' ? '🔒' : '🧩'}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
