import { useCompilerStore, type CompilerStage } from '../../stores/useCompilerStore';

const STAGES: { key: CompilerStage; label: string; aria: string }[] = [
  { key: 'ingestion', label: '需求', aria: 'Ingestion' },
  { key: 'ast', label: 'AST', aria: 'AST' },
  { key: 'constraint', label: '規則', aria: 'Constraint' },
  { key: 'codegen', label: '程式', aria: 'Codegen' },
];

/** 四個 pipeline 階段分頁，作用中階段決定預覽 / 檢視欄要顯示什麼。 */
export default function StageTabs() {
  const stage = useCompilerStore((s) => s.stage);
  const setStage = useCompilerStore((s) => s.setStage);

  return (
    <div role="tablist" aria-label="編譯流程分頁" style={{ display: 'flex', gap: 4 }}>
      {STAGES.map(({ key, label, aria }) => {
        const active = stage === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-pressed={active}
            aria-selected={active}
            aria-label={aria}
            onClick={() => setStage(key)}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: '1px solid',
              borderColor: active ? 'var(--border-accent-hi, var(--accent))' : 'var(--border-subtle, transparent)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              background: active
                ? 'linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))'
                : 'transparent',
              color: active ? '#fff' : 'var(--text-secondary)',
              transition: 'background 140ms, border-color 140ms, color 140ms',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
