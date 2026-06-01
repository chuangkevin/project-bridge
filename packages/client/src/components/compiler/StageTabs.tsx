import { useCompilerStore, type CompilerStage } from '../../stores/useCompilerStore';

/** Visible tabs that map to internal pipeline stages.
 *  - `ingestion` is intentionally NOT surfaced — it renders the same as `ast`
 *    for the preview pane and is meaningless to non-engineers.
 *  - `aria-label` keeps the original enum value so existing e2e + unit
 *    selectors don't break when the visible label changes. */
const STAGES: { key: CompilerStage; label: string; aria: string; hint: string }[] = [
  { key: 'ast', label: '預覽', aria: 'AST', hint: '看編譯後的 UI 長什麼樣子' },
  { key: 'constraint', label: '規則檢查', aria: 'Constraint', hint: '檢查有沒有違反設計規則' },
  { key: 'codegen', label: '程式碼', aria: 'Codegen', hint: '產出的 Vue 3 程式碼（可複製給工程師）' },
];

export default function StageTabs() {
  const stage = useCompilerStore((s) => s.stage);
  const setStage = useCompilerStore((s) => s.setStage);

  return (
    <div role="tablist" aria-label="編譯流程分頁" style={{ display: 'flex', gap: 4 }}>
      {STAGES.map(({ key, label, aria, hint }) => {
        // ingestion was the old default; treat it as if AST is active for highlight purposes
        const active = stage === key || (key === 'ast' && stage === 'ingestion');
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-pressed={active}
            aria-selected={active}
            aria-label={aria}
            title={hint}
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
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
