import { useEffect, useMemo, useRef, useState } from 'react';
import { useResizable } from '../../hooks/useResizable';
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
import AnnotationsPanel from './design/AnnotationsPanel';
import ApiBindingsPanel from './design/ApiBindingsPanel';
import VersionHistoryModal from './design/VersionHistoryModal';
import AnnotateQuickForm from './design/AnnotateQuickForm';
import RegenQuickForm from './design/RegenQuickForm';

interface QualityScore {
  overall: number;
  design: number;
  responsive: number;
  consistency: number;
  accessibility: number;
  summary: string;
}

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
  const { size: chatWidth, handleProps: chatHandleProps } = useResizable(
    `designbridge.design-chat-width.${projectId ?? 'default'}`, 300, 200, 600
  );
  const { turns, refresh: refreshTurns } = useTurns(projectId);
  const { state, send, reset } = useChatStream(projectId, 'design');
  const { artifacts, latest, refresh: refreshArtifacts } = useArtifacts(projectId, 'vue-sfc');

  useSocketSync(projectId, { onTurn: refreshTurns, onArtifact: refreshArtifacts });

  const latestIdRef = useRef<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sfcSource, setSfcSource] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(true);
  const [activeRightTab, setActiveRightTab] = useState<'source' | 'annotations' | 'api-bindings'>('source');
  const [regenerating, setRegenerating] = useState(false);
  const [generatingVariants, setGeneratingVariants] = useState(false);
  const [savingComponent, setSavingComponent] = useState(false);
  const [qualityScore, setQualityScore] = useState<QualityScore | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  // ── Streaming preview ─────────────────────────────────────────────
  // While the AI is still generating, extract partial SFC content from
  // state.answerText so the preview updates in real-time instead of
  // waiting for the full response to complete.
  const streamingSfc = useMemo((): string | null => {
    if (state.phase === 'idle' || state.phase === 'done' || state.phase === 'error') return null;
    const text = state.answerText;
    if (!text) return null;
    // Look for <artifact ...> opening tag
    const openMatch = text.match(/<artifact[^>]*>/i);
    if (!openMatch) {
      // Fallback: try markdown code block (```vue or ```html)
      const codeMatch = text.match(/```(?:vue|html)\r?\n([\s\S]+)/i);
      if (codeMatch) return codeMatch[1].replace(/```[\s\S]*$/, '').trim();
      return null;
    }
    const contentStart = text.indexOf(openMatch[0]) + openMatch[0].length;
    const contentRaw = text.slice(contentStart);
    // Remove closing tag if already present
    return contentRaw.replace(/<\/artifact>[\s\S]*$/, '').trim() || null;
  }, [state.answerText, state.phase]);

  // Council toggle — same localStorage persistence as ConsultStage
  const COUNCIL_KEY = (pid: string) => `designbridge.council_enabled.${pid}`;
  const [councilEnabled, setCouncilEnabled] = useState(() => {
    if (!projectId) return true;
    const saved = localStorage.getItem(COUNCIL_KEY(projectId));
    return saved === null ? true : saved === 'true';
  });
  useEffect(() => {
    if (!projectId) return;
    const saved = localStorage.getItem(COUNCIL_KEY(projectId));
    setCouncilEnabled(saved === null ? true : saved === 'true');
  }, [projectId]);
  const handleCouncilChange = (val: boolean) => {
    setCouncilEnabled(val);
    if (projectId) localStorage.setItem(COUNCIL_KEY(projectId), String(val));
  };

  // 繼承全域風格 — persisted server-side on the project record
  const [inheritGlobal, setInheritGlobal] = useState(true);
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}`)
      .then(r => r.json())
      .then((p: { inheritGlobalStyle?: boolean }) => {
        if (typeof p.inheritGlobalStyle === 'boolean') setInheritGlobal(p.inheritGlobalStyle);
      })
      .catch(() => {});
  }, [projectId]);
  const handleInheritChange = (val: boolean) => {
    setInheritGlobal(val);
    if (!projectId) return;
    fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inheritGlobalStyle: val }),
    }).catch(() => {});
  };

  // Bridge interaction state
  const [bridgeMode, setBridgeMode] = useState<'browse' | 'annotate' | 'regen' | 'component'>('browse');
  const [componentForm, setComponentForm] = useState({ name: '', description: '', scope: 'project' as 'project' | 'global' });
  const [savingElementComponent, setSavingElementComponent] = useState(false);
  const [bridgeClick, setBridgeClick] = useState<{selector:string;tag:string;text:string;dbPath?:string|null;x:number;y:number}|null>(null);
  const [regenInstruction, setRegenInstruction] = useState('');
  const [regenning, setRegenning] = useState(false);

  // 參考網站 crawl panel
  const [showCrawl, setShowCrawl] = useState(false);
  const [crawlUrl, setCrawlUrl] = useState('');
  const [crawling, setCrawling] = useState(false);
  const [crawlResult, setCrawlResult] = useState<CrawlResult | null>(null);

  // Bridge click listener
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'bridge-click') setBridgeClick(e.data);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

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

  // Keep latestIdRef in sync so handleSend can read it after refreshArtifacts
  useEffect(() => {
    latestIdRef.current = latest?.id ?? null;
  }, [latest?.id]);

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

  const handleExport = async () => {
    if (!projectId || !selectedId) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ framework: 'zip' }),
      });
      if (!res.ok) throw new Error(`匯出失敗：${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'design-export.tar.gz';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`匯出失敗：${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  const handleRegenerate = async () => {
    if (!projectId || !selectedId) return;
    const instruction = window.prompt('輸入修改指令（留空則保持原概念重生成）', '') ?? '';
    setRegenerating(true);
    try {
      await api<{ artifact: { id: string; name: string } }>(
        `/api/projects/${projectId}/regenerate-page`,
        { method: 'POST', body: JSON.stringify({ artifactId: selectedId, instruction }) }
      );
      await refreshArtifacts();
    } catch (e) {
      alert(`重新生成失敗：${(e as Error).message}`);
    } finally {
      setRegenerating(false);
    }
  };

  const handleVariants = async () => {
    if (!projectId || !selectedId) return;
    setGeneratingVariants(true);
    try {
      const result = await api<{ variants: Array<{ id: string; name: string }> }>(
        `/api/projects/${projectId}/generate-variants`,
        { method: 'POST', body: JSON.stringify({ artifactId: selectedId }) }
      );
      await refreshArtifacts();
      if (result.variants.length > 0) {
        setSelectedId(result.variants[0].id);
      }
    } catch (e) {
      alert(`產生變體失敗：${(e as Error).message}`);
    } finally {
      setGeneratingVariants(false);
    }
  };

  const handleSaveAsComponent = async () => {
    if (!projectId || !selectedId) return;
    const name = (window.prompt('元件名稱', '') ?? '').trim();
    if (!name) return;
    setSavingComponent(true);
    try {
      await api<{ id: string }>(
        `/api/projects/${projectId}/components/save-from-artifact`,
        { method: 'POST', body: JSON.stringify({ artifactId: selectedId, name }) }
      );
      alert(`已儲存元件「${name}」`);
    } catch (e) {
      alert(`儲存失敗：${(e as Error).message}`);
    } finally {
      setSavingComponent(false);
    }
  };

  // 統一對話流：所有 mode 的 turns 都顯示（mode badge 區分），切分頁不再像對話消失
  const filteredTurns = turns;
  const pending = state.phase === 'idle' ? null : { userText: state.userText, state };

  const handleSend = async (text: string, attachmentIds: string[], replicationIntent?: import('./chat/Composer').ReplicationIntent) => {
    if (!projectId) return;
    const result = await send({ projectId, mode: 'design', text, attachmentIds, council: councilEnabled, replicationIntent });
    // Always refresh turns so the stored turn shows up even on partial success
    await refreshTurns().catch(() => {});
    await refreshArtifacts().catch(() => {});
    reset(); // always reset so overlay clears
    if (result.ok) {
      // Fire quality score request in background for the latest artifact
      // We read latest from the hook via a ref updated after refreshArtifacts()
      setTimeout(() => {
        const latestId = latestIdRef.current;
        if (!latestId) return;
        fetch(`/api/projects/${projectId}/quality-score`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ artifactId: latestId }),
        })
          .then(r => r.json())
          .then((data: { score?: QualityScore }) => { if (data.score) setQualityScore(data.score); })
          .catch(() => {});
      }, 200);
    }
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
        <div className="design__tabs">
          <button
            className="design__tab"
            aria-pressed={showSource && activeRightTab === 'source'}
            onClick={() => { setShowSource(true); setActiveRightTab('source'); }}
          >
            原始碼
          </button>
          <button
            className="design__tab"
            aria-pressed={showSource && activeRightTab === 'annotations'}
            onClick={() => { setShowSource(true); setActiveRightTab('annotations'); }}
          >
            標註
          </button>
          <button
            className="design__tab"
            aria-pressed={showSource && activeRightTab === 'api-bindings'}
            onClick={() => { setShowSource(true); setActiveRightTab('api-bindings'); }}
          >
            API 綁定
          </button>
          <button
            className="design__tab"
            aria-pressed={!showSource}
            onClick={() => setShowSource(v => !v)}
          >
            {showSource ? '收合' : '展開'}
          </button>
        </div>
        {selectedId && (
          <button
            className="design__btn"
            onClick={handleRegenerate}
            disabled={regenerating || state.phase !== 'idle'}
            title="重新生成此頁面"
          >
            {regenerating ? '生成中…' : '🔄 重新生成'}
          </button>
        )}
        {selectedId && (
          <button
            className="design__btn"
            onClick={handleVariants}
            disabled={generatingVariants || state.phase !== 'idle'}
            title="產生 2 個視覺變體"
          >
            {generatingVariants ? '生成中…' : '✨ 產生變體'}
          </button>
        )}
        {selectedId && (
          <button
            className="design__btn"
            onClick={handleSaveAsComponent}
            disabled={savingComponent || state.phase !== 'idle'}
            title="將目前頁面儲存為可重用元件"
          >
            {savingComponent ? '儲存中…' : '💾 儲存為元件'}
          </button>
        )}
        {selectedId && (
          <button
            className="design__btn"
            onClick={handleExport}
            disabled={exporting}
            title="匯出所有頁面為 tar.gz"
          >
            {exporting ? '匯出中…' : '📦 匯出'}
          </button>
        )}
        {selectedId && (
          <button
            className="design__btn"
            onClick={() => setShowVersionHistory(true)}
            title="查看版本歷史"
          >
            ⏱ 版本
          </button>
        )}
        {selectedId && (
          <>
            <button className="design__btn" onClick={() => setBridgeMode(m => m === 'annotate' ? 'browse' : 'annotate')}
              style={{ background: bridgeMode === 'annotate' ? 'var(--accent-glass)' : undefined }}>
              🖊 標註
            </button>
            <button className="design__btn" onClick={() => setBridgeMode(m => m === 'regen' ? 'browse' : 'regen')}
              style={{ background: bridgeMode === 'regen' ? 'var(--accent-glass)' : undefined }}>
              ⚡ 重生成
            </button>
            <button className="design__btn" onClick={() => setBridgeMode(m => m === 'component' ? 'browse' : 'component')}
              style={{ background: bridgeMode === 'component' ? 'var(--accent-glass)' : undefined }}
              title="點選預覽中的元素，存入元件庫供之後原樣重用">
              📦 存元素為元件
            </button>
          </>
        )}
        {qualityScore && (
          <span
            title={`設計:${qualityScore.design} 響應:${qualityScore.responsive} 一致性:${qualityScore.consistency} 無障礙:${qualityScore.accessibility}\n${qualityScore.summary}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: qualityScore.overall >= 80 ? 'var(--color-success, #22c55e)' : qualityScore.overall >= 60 ? 'var(--accent-primary)' : 'var(--color-warning, #f59e0b)',
              color: '#fff',
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'help',
              userSelect: 'none',
            }}
          >
            🎯 {qualityScore.overall}
          </span>
        )}
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

      {/* ── Main area: left chat | center preview | right source drawer ── */}
      <div className="design__body">
        {/* Left: chat panel */}
        <div className="design__chat-panel" style={{ width: chatWidth, flexShrink: 0 }}>
          {/* Council toggle */}
          <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button role="switch" aria-checked={councilEnabled} onClick={() => handleCouncilChange(!councilEnabled)}
              style={{ position:'relative', display:'inline-flex', alignItems:'center', width:32, height:18, borderRadius:9, border:'none', cursor:'pointer', background: councilEnabled ? 'var(--accent)' : 'var(--bg-input)', transition:'background 0.2s', flexShrink:0, padding:0 }}>
              <span style={{ position:'absolute', left: councilEnabled ? 15 : 2, width:14, height:14, borderRadius:'50%', background: councilEnabled ? '#fff' : 'var(--text-muted)', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.3)' }} />
            </button>
            <span style={{ fontSize:11, color: councilEnabled ? 'var(--text-accent)' : 'var(--text-muted)', cursor:'pointer', userSelect:'none' }} onClick={() => handleCouncilChange(!councilEnabled)}>
              合議
            </span>
            <span style={{ width: 1, height: 14, background: 'var(--border-subtle)' }} />
            <button role="switch" aria-checked={inheritGlobal} onClick={() => handleInheritChange(!inheritGlobal)}
              title="開啟時，設計生成會套用「設定 → 全域風格」的設計方向、規範與 tokens"
              style={{ position:'relative', display:'inline-flex', alignItems:'center', width:32, height:18, borderRadius:9, border:'none', cursor:'pointer', background: inheritGlobal ? 'var(--accent)' : 'var(--bg-input)', transition:'background 0.2s', flexShrink:0, padding:0 }}>
              <span style={{ position:'absolute', left: inheritGlobal ? 15 : 2, width:14, height:14, borderRadius:'50%', background: inheritGlobal ? '#fff' : 'var(--text-muted)', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.3)' }} />
            </button>
            <span style={{ fontSize:11, color: inheritGlobal ? 'var(--text-accent)' : 'var(--text-muted)', cursor:'pointer', userSelect:'none' }} onClick={() => handleInheritChange(!inheritGlobal)}>
              繼承全域風格
            </span>
          </div>
          <Transcript
            turns={filteredTurns} pending={pending}
            onQuickReply={(text) => { void handleSend(text, []); }}
            quickReplyDisabled={state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'error'}
          />
          <Composer
            projectId={projectId ?? ''}
            disabled={state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'error'}
            onSend={handleSend}
            enableReplicationIntake
            selectedElementPath={bridgeClick?.dbPath
              ? bridgeClick.dbPath.split('/').map(n => Number(n)).filter(n => Number.isInteger(n) && n >= 0)
              : null}
          />
        </div>

        {/* Drag handle — flex sibling between chat and preview (same pattern as ArchitectStage) */}
        <div
          onPointerDown={chatHandleProps.onPointerDown}
          onPointerMove={chatHandleProps.onPointerMove}
          onPointerUp={chatHandleProps.onPointerUp}
          onPointerEnter={chatHandleProps.onPointerEnter}
          onPointerLeave={chatHandleProps.onPointerLeave}
          style={{ width: 5, flexShrink: 0, cursor: 'col-resize', background: 'transparent', zIndex: 10, touchAction: 'none' }}
        />

        {/* Center: preview */}
        <div className="design__preview-main" style={{ position: 'relative' }}>
          {/* Generating overlay — shown while streaming but no SFC content yet */}
          {state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'error' && !streamingSfc && !sfcSource && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', background: 'rgba(6,13,26,0.85)',
              zIndex: 3, gap: 12,
            }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animation: 'pulse 1.2s ease-in-out infinite' }} />
              <span style={{ color: 'var(--text-accent)', fontSize: 14 }}>
                {state.phase.startsWith('council') ? '合議討論中，完成後自動生成設計…' : '生成設計中…'}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 11, maxWidth: 260, textAlign: 'center' }}>
                預覽將在 AI 生成第一段 HTML 後自動出現
              </span>
            </div>
          )}
          {streamingSfc
            ? (
              <>
                <div style={{
                  position: 'absolute', top: 8, right: 12, zIndex: 5,
                  background: 'var(--accent-glass)', border: '1px solid var(--border-accent)',
                  borderRadius: 6, padding: '3px 8px', fontSize: 11, color: 'var(--text-accent)',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animation: 'pulse 1.2s ease-in-out infinite' }} />
                  即時生成中…
                </div>
                <VueSfcPreview sfc={streamingSfc} key="streaming" bridgeMode="browse" />
              </>
            )
            : sfcSource
              ? <VueSfcPreview sfc={sfcSource} key={selectedId} bridgeMode={bridgeMode} />
              : (
                <div className="design__empty">
                  {artifacts.length === 0
                    ? '在左側對話讓 AI 幫你產出 Vue + Tailwind 頁面。'
                    : '載入中…'}
                </div>
              )
          }
        </div>

        {/* Right: source/annotations drawer (shown when showSource) */}
        {showSource && (
          <div className="design__source-drawer">
            <div className="design__source-tabs">
              {(['source', 'annotations', 'api-bindings'] as const).map(t => (
                <button key={t} className="design__tab" aria-pressed={activeRightTab === t} onClick={() => setActiveRightTab(t)}>
                  {t === 'source' ? '原始碼' : t === 'annotations' ? '標註' : 'API'}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {activeRightTab === 'source' && (
                sfcSource ? <SfcSourceViewer source={sfcSource} /> : <div className="design__empty">沒有原始碼</div>
              )}
              {activeRightTab === 'annotations' && projectId && <AnnotationsPanel projectId={projectId} />}
              {activeRightTab === 'api-bindings' && projectId && <ApiBindingsPanel projectId={projectId} />}
            </div>
          </div>
        )}
      </div>

      {showVersionHistory && projectId && selectedId && (
        <VersionHistoryModal
          projectId={projectId}
          artifactId={selectedId}
          onClose={() => setShowVersionHistory(false)}
          onSelect={(id) => { setSelectedId(id); setShowVersionHistory(false); }}
        />
      )}

      {bridgeClick && (
        <>
          {/* Dismiss overlay */}
          <div style={{position:'fixed',inset:0,zIndex:999}} onClick={()=>{setBridgeClick(null);setBridgeMode('browse');}} />
          <div style={{
            position:'fixed', left:bridgeClick.x, top:bridgeClick.y,
            transform:'translateX(-50%)', zIndex:1000, minWidth:240,
            background:'var(--bg-card)', border:'1px solid var(--border-accent)',
            borderRadius:8, padding:12, boxShadow:'var(--glass-shadow)',
          }}>
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:8}}>
              選取：{bridgeClick.tag}{bridgeClick.text ? ` · ${bridgeClick.text}` : ` · ${bridgeClick.selector}`}
            </div>
            {bridgeMode === 'annotate' ? (
              <AnnotateQuickForm
                projectId={projectId!} bridgeId={bridgeClick.selector}
                onDone={() => { setBridgeClick(null); setBridgeMode('browse'); }}
              />
            ) : bridgeMode === 'component' ? (
              <div>
                <input
                  autoFocus value={componentForm.name}
                  onChange={e => setComponentForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="元件名稱（例：pricing-card）"
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 12, boxSizing: 'border-box' }}
                />
                <input
                  value={componentForm.description}
                  onChange={e => setComponentForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="描述（AI 依此判斷何時使用這個元件）"
                  style={{ width: '100%', marginTop: 6, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 12, boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input type="checkbox" checked={componentForm.scope === 'global'}
                      onChange={e => setComponentForm(f => ({ ...f, scope: e.target.checked ? 'global' : 'project' }))} />
                    全域元件（所有專案可用）
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => { setBridgeClick(null); setBridgeMode('browse'); }} disabled={savingElementComponent}
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12 }}>
                      取消
                    </button>
                    <button
                      disabled={savingElementComponent || !componentForm.name.trim()}
                      onClick={async () => {
                        if (!projectId || !selectedId) return;
                        const elementPath = bridgeClick.dbPath
                          ? bridgeClick.dbPath.split('/').map(n => Number(n)).filter(n => Number.isInteger(n) && n >= 0)
                          : null;
                        if (!elementPath || elementPath.length === 0) { alert('無法取得元素路徑，請重新點選元素'); return; }
                        setSavingElementComponent(true);
                        try {
                          const doSave = async (overwrite: boolean) => fetch(`/api/projects/${projectId}/components/save-from-artifact`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              artifactId: selectedId, elementPath, overwrite,
                              name: componentForm.name.trim(), description: componentForm.description.trim(),
                              scope: componentForm.scope,
                            }),
                          });
                          let r = await doSave(false);
                          if (r.status === 409) {
                            if (!confirm(`同範圍已存在元件「${componentForm.name.trim()}」，要覆蓋並升版嗎？`)) return;
                            r = await doSave(true);
                          }
                          if (!r.ok) {
                            const err = await r.json().catch(() => null);
                            alert(`儲存失敗：${err?.error?.message ?? r.status}`);
                            return;
                          }
                          alert(`已存入元件庫：「${componentForm.name.trim()}」`);
                          setComponentForm({ name: '', description: '', scope: 'project' });
                          setBridgeClick(null); setBridgeMode('browse');
                        } finally {
                          setSavingElementComponent(false);
                        }
                      }}
                      style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12 }}>
                      {savingElementComponent ? '儲存中…' : '存入元件庫'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <RegenQuickForm
                instruction={regenInstruction} onChange={setRegenInstruction}
                loading={regenning}
                onSubmit={async () => {
                  if (!projectId || !selectedId) return;
                  setRegenning(true);
                  try {
                    const elementPath = bridgeClick.dbPath
                      ? bridgeClick.dbPath.split('/').map(n => Number(n)).filter(n => Number.isInteger(n) && n >= 0)
                      : null;
                    const r = await fetch(`/api/projects/${projectId}/quick-regen`, {
                      method:'POST', headers:{'Content-Type':'application/json'},
                      body: JSON.stringify({
                        artifactId: selectedId, bridgeSelector: bridgeClick.selector, instruction: regenInstruction,
                        ...(elementPath && elementPath.length > 0 ? { elementPath } : {}),
                      }),
                    });
                    const data = await r.json();
                    if (data.ok) {
                      if (data.downgraded) {
                        console.warn(`[quick-regen] 元素軌道降級為整頁重生：${data.downgradeReason ?? ''}`);
                      }
                      await refreshArtifacts(); setSelectedId(data.artifactId);
                    }
                  } finally {
                    setRegenning(false); setBridgeClick(null); setRegenInstruction(''); setBridgeMode('browse');
                  }
                }}
                onCancel={() => { setBridgeClick(null); setBridgeMode('browse'); }}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

