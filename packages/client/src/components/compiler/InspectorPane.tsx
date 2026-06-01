import { useState } from 'react';
import { useCompilerStore } from '../../stores/useCompilerStore';

const preStyle: React.CSSProperties = {
  margin: 0,
  padding: 14,
  fontSize: 12,
  lineHeight: 1.55,
  overflow: 'auto',
  height: '100%',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontFamily: '"SF Mono", "Fira Code", Consolas, monospace',
};

/** 右側檢視欄。依目前 stage 顯示 AST 樹 / 違規清單 / 程式碼。
 *  Mirror 產出顯示來源資訊 + 升級成 AST 的按鈕。 */
export default function InspectorPane() {
  const artifacts = useCompilerStore((s) => s.artifacts);
  const activeArtifactId = useCompilerStore((s) => s.activeArtifactId);
  const stage = useCompilerStore((s) => s.stage);
  const upgradeMirrorToAstAction = useCompilerStore((s) => s.upgradeMirrorToAstAction);
  const isCompiling = useCompilerStore((s) => s.isCompiling);
  const active = artifacts.find((a) => a.id === activeArtifactId);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  if (!active) {
    return (
      <div
        style={{
          height: '100%',
          padding: '32px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 12,
          textAlign: 'center',
          color: 'var(--text-muted)',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: 'var(--accent-glass)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
          }}
        >
          🔍
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
          尚未選擇產出
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          編譯完成後，
          <br />
          可在這裡檢視 AST 樹、
          <br />
          規則違規或產出的 Vue 程式碼。
        </div>
      </div>
    );
  }

  if (active.kind === 'mirror') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          padding: 16,
          gap: 10,
          fontSize: 13,
          color: 'var(--text-primary)',
        }}
      >
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            來源
          </div>
          <a
            href={active.sourceUrl}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--text-accent, var(--accent))', wordBreak: 'break-all' }}
          >
            {active.sourceUrl}
          </a>
        </div>
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            爬取時間
          </div>
          <div>{active.crawledAt}</div>
        </div>
        {active.warnings.length > 0 && (
          <div>
            <div style={{ color: '#fbbf24', fontWeight: 600, marginBottom: 4 }}>
              警告（{active.warnings.length}）
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-secondary)', fontSize: 12 }}>
              {active.warnings.slice(0, 10).map((w, i) => (
                <li key={i}>{w.code}{w.url ? ` — ${w.url}` : ''}</li>
              ))}
            </ul>
          </div>
        )}
        {upgradeError && (
          <div
            role="alert"
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: 'rgba(220,38,38,0.12)',
              color: '#fca5a5',
              fontSize: 12,
              border: '1px solid rgba(220,38,38,0.4)',
            }}
          >
            {upgradeError}
          </div>
        )}
        <div style={{ marginTop: 'auto' }}>
          <button
            type="button"
            disabled={isCompiling}
            onClick={async () => {
              setUpgradeError(null);
              try {
                const r = await upgradeMirrorToAstAction(active.id);
                if (!r.ok) setUpgradeError(`升級失敗：${r.reason ?? '未知原因'}${r.detail ? ` — ${r.detail}` : ''}`);
              } catch (err) {
                setUpgradeError(err instanceof Error ? err.message : String(err));
              }
            }}
            style={{
              width: '100%',
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: 'none',
              cursor: isCompiling ? 'default' : 'pointer',
              background: isCompiling
                ? 'var(--text-muted)'
                : 'linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))',
              color: '#fff',
              boxShadow: isCompiling ? 'none' : 'var(--shadow-sm)',
            }}
          >
            {isCompiling ? '升級中…' : '升級為 AST（可編輯）'}
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'codegen') {
    const copy = (): void => {
      navigator.clipboard?.writeText(active.vue.code);
    };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div
          style={{
            padding: '10px 12px',
            borderBottom: '1px solid var(--border-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-card)',
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {active.vue.filename}
          </span>
          <button
            type="button"
            onClick={copy}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid var(--border-primary)',
              cursor: 'pointer',
              background: 'transparent',
              color: 'var(--text-secondary)',
            }}
          >
            📋 複製
          </button>
        </div>
        <pre style={{ ...preStyle, flex: 1, height: 'auto' }}>{active.vue.code}</pre>
      </div>
    );
  }

  if (stage === 'constraint') {
    if (active.violations.length === 0) {
      return (
        <div
          style={{
            padding: 20,
            fontSize: 13,
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span aria-hidden>✅</span>
          無規則違規。
        </div>
      );
    }
    return (
      <ul style={{ margin: 0, padding: 16, paddingLeft: 28, fontSize: 13, overflow: 'auto', height: '100%' }}>
        {active.violations.map((v, i) => (
          <li key={`${v.ruleId}-${v.nodeId}-${i}`} style={{ marginBottom: 12 }}>
            <div
              style={{
                fontWeight: 600,
                color: v.severity === 'error' ? '#f87171' : '#fbbf24',
                marginBottom: 2,
              }}
            >
              {v.ruleId}（{v.severity === 'error' ? '錯誤' : '警告'}）
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 2 }}>
              node: {v.nodeId}
            </div>
            <div style={{ color: 'var(--text-primary)' }}>{v.message}</div>
          </li>
        ))}
      </ul>
    );
  }

  // 'ingestion' | 'ast' — read-only AST tree (v1)
  return <pre style={preStyle}>{JSON.stringify(active.ast, null, 2)}</pre>;
}
