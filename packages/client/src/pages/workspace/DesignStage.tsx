import { useEffect, useRef, useState } from 'react';
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
  const { turns, refresh: refreshTurns } = useTurns(projectId);
  const { state, send, reset } = useChatStream();
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

  // Bridge interaction state
  const [bridgeMode, setBridgeMode] = useState<'browse' | 'annotate' | 'regen'>('browse');
  const [bridgeClick, setBridgeClick] = useState<{selector:string;tag:string;text:string;x:number;y:number}|null>(null);
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

  const filteredTurns = turns.filter((t) => t.mode === 'design');
  const pending = state.phase === 'idle' ? null : { userText: pendingRef.current, state };

  const handleSend = async (text: string, attachmentIds: string[]) => {
    if (!projectId) return;
    pendingRef.current = text;
    const result = await send({ projectId, mode: 'design', text, attachmentIds, council: councilEnabled });
    if (result.ok) {
      await Promise.all([refreshTurns(), refreshArtifacts()]);
      pendingRef.current = '';
      reset();
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

      <div className="design__split">
        <div className="design__preview">
          {sfcSource
            ? <VueSfcPreview sfc={sfcSource} key={selectedId} bridgeMode={bridgeMode} />
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
            {activeRightTab === 'source' && (
              sfcSource
                ? <SfcSourceViewer source={sfcSource} />
                : <div className="design__empty">沒有原始碼</div>
            )}
            {activeRightTab === 'annotations' && projectId && (
              <AnnotationsPanel projectId={projectId} />
            )}
            {activeRightTab === 'api-bindings' && projectId && (
              <ApiBindingsPanel projectId={projectId} />
            )}
          </div>
        )}
      </div>

      <div className="design__chat">
        {/* Council toggle — same pill switch as ConsultStage */}
        <div style={{ padding: '6px var(--space-5)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button role="switch" aria-checked={councilEnabled} onClick={() => handleCouncilChange(!councilEnabled)}
            style={{ position:'relative', display:'inline-flex', alignItems:'center', width:36, height:20, borderRadius:10, border:'none', cursor:'pointer', background: councilEnabled ? 'var(--accent)' : 'var(--bg-input)', transition:'background 0.2s', flexShrink:0, padding:0 }}>
            <span style={{ position:'absolute', left: councilEnabled ? 18 : 2, width:16, height:16, borderRadius:'50%', background: councilEnabled ? '#fff' : 'var(--text-muted)', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.3)' }} />
          </button>
          <span style={{ fontSize:12, color: councilEnabled ? 'var(--text-accent)' : 'var(--text-muted)', cursor:'pointer', userSelect:'none' }} onClick={() => handleCouncilChange(!councilEnabled)}>
            合議模式（PM / Designer / Engineer / Moderator 四方討論）
          </span>
        </div>
        <Transcript turns={filteredTurns} pending={pending} />
        <Composer
          projectId={projectId ?? ''}
          disabled={state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'error'}
          onSend={handleSend}
        />
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
            ) : (
              <RegenQuickForm
                instruction={regenInstruction} onChange={setRegenInstruction}
                loading={regenning}
                onSubmit={async () => {
                  if (!projectId || !selectedId) return;
                  setRegenning(true);
                  try {
                    const r = await fetch(`/api/projects/${projectId}/quick-regen`, {
                      method:'POST', headers:{'Content-Type':'application/json'},
                      body: JSON.stringify({ artifactId: selectedId, bridgeSelector: bridgeClick.selector, instruction: regenInstruction }),
                    });
                    const data = await r.json();
                    if (data.ok) { await refreshArtifacts(); setSelectedId(data.artifactId); }
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

const pendingRef = { current: '' };

function AnnotateQuickForm({ projectId, bridgeId, onDone }: { projectId:string; bridgeId:string; onDone:()=>void }) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/projects/${projectId}/annotations`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ bridgeId, content, label: bridgeId }),
      });
      onDone();
    } finally { setSaving(false); }
  };
  return (
    <div>
      <textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="標註內容…" rows={3}
        style={{width:'100%',background:'var(--bg-input)',border:'1px solid var(--border-primary)',color:'var(--text-primary)',padding:6,borderRadius:4,fontSize:12,resize:'vertical'}} />
      <div style={{display:'flex',gap:6,marginTop:6,justifyContent:'flex-end'}}>
        <button className="design__btn" onClick={onDone}>取消</button>
        <button className="design__btn" onClick={handleSave} disabled={saving||!content.trim()}
          style={{background:'var(--accent)',color:'white',border:'none'}}>
          {saving?'儲存中…':'新增標註'}
        </button>
      </div>
    </div>
  );
}

function RegenQuickForm({ instruction, onChange, loading, onSubmit, onCancel }:
  { instruction:string; onChange:(v:string)=>void; loading:boolean; onSubmit:()=>void; onCancel:()=>void }) {
  return (
    <div>
      <textarea value={instruction} onChange={e=>onChange(e.target.value)} placeholder="描述要怎麼修改這個元素…" rows={3}
        style={{width:'100%',background:'var(--bg-input)',border:'1px solid var(--border-primary)',color:'var(--text-primary)',padding:6,borderRadius:4,fontSize:12,resize:'vertical'}} />
      <div style={{display:'flex',gap:6,marginTop:6,justifyContent:'flex-end'}}>
        <button className="design__btn" onClick={onCancel}>取消</button>
        <button className="design__btn" onClick={onSubmit} disabled={loading||!instruction.trim()}
          style={{background:'var(--accent)',color:'white',border:'none'}}>
          {loading?'生成中…':'⚡ 重新生成'}
        </button>
      </div>
    </div>
  );
}
