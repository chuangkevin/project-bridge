import { useCompilerStore } from '../../stores/useCompilerStore';
import { buildPreviewHtml } from '../../lib/previewHtml';
import { getMirrorUrl } from '../../lib/compileApi';

/** 中央預覽區。依目前 pipeline stage 顯示不同內容（mirror iframe / Vue 預覽 / codegen 程式碼）。 */
export default function PreviewPane() {
  const projectId = useCompilerStore((s) => s.projectId);
  const artifacts = useCompilerStore((s) => s.artifacts);
  const activeArtifactId = useCompilerStore((s) => s.activeArtifactId);
  const stage = useCompilerStore((s) => s.stage);
  const active = artifacts.find((a) => a.id === activeArtifactId);

  if (!active) {
    return (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6 }}>
          在左側對話輸入需求後，預覽會顯示在這裡。
        </div>
      </div>
    );
  }

  if (active.kind === 'mirror') {
    return (
      <iframe
        title="Mirror 預覽"
        sandbox="allow-same-origin"
        src={getMirrorUrl(projectId, active.id, 'page.html')}
        style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
      />
    );
  }

  if (stage === 'codegen') {
    return (
      <pre
        style={{
          margin: 0,
          padding: 16,
          fontSize: 12,
          lineHeight: 1.6,
          overflow: 'auto',
          height: '100%',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          fontFamily: '"SF Mono", "Fira Code", Consolas, monospace',
        }}
      >
        {active.vue.code}
      </pre>
    );
  }

  if (stage === 'constraint') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div
          style={{
            padding: 12,
            borderBottom: '1px solid var(--border-primary)',
            overflow: 'auto',
            maxHeight: '40%',
            background: 'var(--bg-secondary)',
          }}
        >
          {active.violations.length === 0 ? (
            <div
              style={{
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
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-primary)' }}>
              {active.violations.map((v, i) => (
                <li
                  key={`${v.ruleId}-${v.nodeId}-${i}`}
                  style={{ color: v.severity === 'error' ? '#f87171' : '#fbbf24', marginBottom: 4 }}
                >
                  <strong>{v.ruleId}</strong> — {v.message}（{v.severity === 'error' ? '錯誤' : '警告'}）
                </li>
              ))}
            </ul>
          )}
        </div>
        <iframe
          title="預覽"
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
      title="預覽"
      sandbox="allow-scripts"
      srcDoc={buildPreviewHtml(active.vue.code)}
      style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
    />
  );
}
