import { useCompilerStore } from '../../stores/useCompilerStore';

/** Vertical list of compiled artifacts. Click to make one active. */
export default function ArtifactRail() {
  const artifacts = useCompilerStore((s) => s.artifacts);
  const activeArtifactId = useCompilerStore((s) => s.activeArtifactId);
  const selectArtifact = useCompilerStore((s) => s.selectArtifact);

  if (artifacts.length === 0) {
    return (
      <div
        style={{
          padding: 12,
          fontSize: 13,
          color: 'var(--text-muted, #94a3b8)',
        }}
      >
        No artifacts yet
      </div>
    );
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {artifacts.map((a) => {
        const active = a.id === activeArtifactId;
        return (
          <li key={a.id}>
            <button
              type="button"
              aria-pressed={active}
              onClick={() => selectArtifact(a.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid var(--border-primary, #e2e8f0)',
                cursor: 'pointer',
                fontSize: 13,
                background: active ? 'var(--accent-light, rgba(142,111,167,0.08))' : 'var(--bg-secondary, #fff)',
                color: active ? 'var(--accent, #8E6FA7)' : 'var(--text-primary, #1e293b)',
                fontWeight: active ? 600 : 400,
              }}
            >
              {a.ast.artifactId}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
