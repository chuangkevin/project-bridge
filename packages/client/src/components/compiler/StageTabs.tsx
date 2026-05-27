import { useCompilerStore, type CompilerStage } from '../../stores/useCompilerStore';

const STAGES: { key: CompilerStage; label: string }[] = [
  { key: 'ingestion', label: 'Ingestion' },
  { key: 'ast', label: 'AST' },
  { key: 'constraint', label: 'Constraint' },
  { key: 'codegen', label: 'Codegen' },
];

/** Four pipeline-stage tabs. Active stage drives what the Preview/Inspector panes show. */
export default function StageTabs() {
  const stage = useCompilerStore((s) => s.stage);
  const setStage = useCompilerStore((s) => s.setStage);

  return (
    <div role="tablist" aria-label="Compiler stages" style={{ display: 'flex', gap: 4 }}>
      {STAGES.map(({ key, label }) => {
        const active = stage === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-pressed={active}
            aria-selected={active}
            onClick={() => setStage(key)}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: '1px solid var(--border-primary, #e2e8f0)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              background: active ? 'var(--accent, #8E6FA7)' : 'var(--bg-secondary, #fff)',
              color: active ? '#fff' : 'var(--text-secondary, #64748b)',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
