import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { useTurns } from '../../hooks/useTurns';
import { useChatStream } from '../../hooks/useChatStream';
import { useArtifacts, fetchArtifactPayload } from '../../hooks/useArtifacts';
import { useSocketSync } from '../../hooks/useSocketSync';
import { api } from '../../lib/api';
import Transcript from './chat/Transcript';
import Composer from './chat/Composer';
import VueSfcPreview from './design/VueSfcPreview';
import SfcSourceViewer from './design/SfcSourceViewer';
import ArtifactPicker from './design/ArtifactPicker';

interface CrawlResult {
  success: boolean;
  error?: string;
  styles?: {
    colors: { value: string; count: number }[];
    typography: any;
    buttons: any[];
    inputs: any[];
    backgrounds: any[];
    borderRadii: { value: string; count: number }[];
    shadows: { value: string; count: number }[];
  };
  screenshot?: string | null;
}

export default function DesignStage() {
  const { projectId } = useWorkspaceStore();
  const { turns, refresh: refreshTurns } = useTurns(projectId);
  const { state, send, reset } = useChatStream();
  const { artifacts, latest, refresh: refreshArtifacts } = useArtifacts(projectId, 'vue-sfc');

  useSocketSync(projectId, { onTurn: refreshTurns, onArtifact: refreshArtifacts });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sfcSource, setSfcSource] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(true);

  // 參考網站 crawl panel
  const [showCrawl, setShowCrawl] = useState(false);
  const [crawlUrl, setCrawlUrl] = useState('');
  const [crawling, setCrawling] = useState(false);
  const [crawlResult, setCrawlResult] = useState<CrawlResult | null>(null);

  const handleCrawl = async () => {
    if (!crawlUrl || !projectId) return;
    setCrawling(true);
    setCrawlResult(null);
    try {
      const r = await api<CrawlResult>(
        `/api/projects/${projectId}/crawl-website`,
        { method: 'POST', body: JSON.stringify({ url: crawlUrl }) }
      );
      setCrawlResult(r);
    } catch (e) {
      setCrawlResult({ success: false, error: (e as Error).message });
    } finally {
      setCrawling(false);
    }
  };

  // Auto-select latest on update
  useEffect(() => {
    if (!selectedId && latest) setSelectedId(latest.id);
    if (selectedId && !artifacts.some(a => a.id === selectedId) && latest) setSelectedId(latest.id);
  }, [latest?.id, artifacts, selectedId]);

  // Fetch payload when selectedId changes
  useEffect(() => {
    if (!projectId || !selectedId) { setSfcSource(null); return; }
    fetchArtifactPayload<string>(projectId, selectedId)
      .then((p) => {
        // Payload may be parsed as JSON if content-type was JSON. vue-sfc has text/plain → always string.
        setSfcSource(typeof p === 'string' ? p : JSON.stringify(p, null, 2));
      })
      .catch(() => setSfcSource(null));
  }, [projectId, selectedId]);

  const filteredTurns = turns.filter((t) => t.mode === 'design');
  const pending = state.phase === 'idle' ? null : { userText: pendingRef.current, state };

  const handleSend = async (text: string, attachmentIds: string[]) => {
    if (!projectId) return;
    pendingRef.current = text;
    const result = await send({ projectId, mode: 'design', text, attachmentIds });
    if (result.ok) {
      await Promise.all([refreshTurns(), refreshArtifacts()]);
      pendingRef.current = '';
      reset();
    }
    // On error: keep state.phase === 'error' so the user sees the error message.
  };

  return (
    <div className="design">
      <div className="design__header">
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>頁面：</span>
        <ArtifactPicker artifacts={artifacts} selectedId={selectedId} onSelect={setSelectedId} />
        <button
          onClick={() => setShowCrawl(!showCrawl)}
          title="參考網站：爬取網站設計樣式"
          style={{
            marginLeft: 'auto',
            background: showCrawl ? 'var(--accent-primary)' : 'var(--bg-elevated)',
            border: '1px solid var(--border-primary)',
            color: showCrawl ? '#fff' : 'var(--text-secondary)',
            padding: '4px 10px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >🔗 參考網站</button>
        <button
          onClick={() => setShowSource(!showSource)}
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-primary)',
            color: 'var(--text-secondary)',
            padding: '4px 10px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >{showSource ? '隱藏原始碼' : '顯示原始碼'}</button>
      </div>

      {showCrawl && (
        <div style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-card)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="url"
              placeholder="https://example.com"
              value={crawlUrl}
              onChange={e => setCrawlUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCrawl()}
              style={{
                flex: 1,
                padding: '5px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-primary)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                fontSize: 13,
              }}
            />
            <button
              onClick={handleCrawl}
              disabled={crawling || !crawlUrl}
              style={{
                padding: '5px 14px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: 'var(--accent-primary)',
                color: '#fff',
                fontSize: 13,
                cursor: crawling || !crawlUrl ? 'not-allowed' : 'pointer',
                opacity: crawling || !crawlUrl ? 0.6 : 1,
              }}
            >{crawling ? '爬取中…' : '爬取'}</button>
          </div>

          {crawlResult && !crawlResult.success && (
            <div style={{ fontSize: 12, color: 'var(--color-error, #ef4444)' }}>
              爬取失敗：{crawlResult.error}
            </div>
          )}

          {crawlResult?.success && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {crawlResult.screenshot && (
                <img
                  src={crawlResult.screenshot}
                  alt="網站截圖"
                  style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border-subtle)' }}
                />
              )}
              {crawlResult.styles && crawlResult.styles.colors.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>擷取色票</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {crawlResult.styles.colors.slice(0, 12).map((c, i) => (
                      <div
                        key={i}
                        title={c.value}
                        style={{
                          width: 20, height: 20,
                          borderRadius: 3,
                          background: c.value,
                          border: '1px solid var(--border-subtle)',
                          cursor: 'default',
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
              {crawlResult.styles?.typography?.fonts && crawlResult.styles.typography.fonts.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>字型：</span>
                  {crawlResult.styles.typography.fonts.slice(0, 2).map((f: any) => f.value).join('、')}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="design__split">
        <div className="design__preview">
          {sfcSource
            ? <VueSfcPreview sfc={sfcSource} key={selectedId} />
            : (
              <div className="design__empty">
                {artifacts.length === 0
                  ? '還沒有設計。在下方對話讓 AI 幫你產出 Vue + Tailwind 頁面。'
                  : '載入中…'}
              </div>
            )
          }
        </div>
        {showSource && (
          <div className="design__source">
            {sfcSource
              ? <SfcSourceViewer source={sfcSource} />
              : <div className="design__empty">沒有原始碼</div>
            }
          </div>
        )}
      </div>

      <div className="design__chat">
        <Transcript turns={filteredTurns} pending={pending} />
        <Composer
          projectId={projectId ?? ''}
          disabled={state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'error'}
          onSend={handleSend}
        />
      </div>
    </div>
  );
}

const pendingRef = { current: '' };
