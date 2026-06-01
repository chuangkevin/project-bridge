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
          padding: 32,
        }}
      >
        <div
          style={{
            maxWidth: 480,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            color: 'var(--text-secondary)',
          }}
        >
          <div
            aria-hidden
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background:
                'linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
              color: '#fff',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            🎨
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
            AI UI 編譯器
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.7 }}>
            把需求、截圖或網址丟進左邊的對話欄，
            <br />
            系統會先做語意理解，套規則，最後產出
            <br />
            可預覽 / 可編輯 / 可下載的 Vue 介面。
          </div>
          <div
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              justifyContent: 'center',
              marginTop: 4,
            }}
          >
            {[
              { icon: '📝', label: '文字需求' },
              { icon: '🖼', label: '截圖' },
              { icon: '🔗', label: '網址' },
            ].map((t) => (
              <div
                key={t.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-card)',
                  fontSize: 12,
                }}
              >
                <span aria-hidden>{t.icon}</span>
                <span>{t.label}</span>
              </div>
            ))}
          </div>
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
