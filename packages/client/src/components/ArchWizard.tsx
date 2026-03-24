import { useState, useRef } from 'react';
import { useArchStore, ArchData, ArchNode, ArchEdge } from '../stores/useArchStore';
import { compressImage } from '../utils/imageCompress';

interface Props {
  projectId: string;
  onComplete: (data: ArchData) => void;
  onSkip?: () => void;
}

type WizardStep =
  | { type: 'type-select' }
  | { type: 'page-subtype' }
  | { type: 'page-count' }
  | { type: 'page-define'; index: number; totalPages: number | null }
  | { type: 'component-name' }
  | { type: 'component-interactions' }
  | { type: 'component-outcomes'; interactionIndex: number; interactions: string[] }
  | { type: 'component-states'; interactions: Array<{ label: string; outcome: string }> }
  | { type: 'finish' };

const PAGE_NAME_CHIPS = ['首頁', '列表頁', '詳細頁', '登入頁', '搜尋頁', '設定頁'];
const COMPONENT_CHIPS = ['Button', 'Card', 'Form', 'Modal', 'Navbar', 'Table'];
const INTERACTION_CHIPS = ['主要按鈕', '次要按鈕', '輸入框', '關閉', '提交', '返回'];
const OUTCOME_CHIPS = ['顯示/隱藏內容', '跳轉頁面', '送出表單', '顯示 loading', '顯示成功', '顯示錯誤'];
const STATE_CHIPS = ['預設', 'hover', 'loading', 'success', 'error'];

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  padding: '40px 48px',
  boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
  maxWidth: 560,
  width: '100%',
  animation: 'slideIn 0.25s ease',
};

const chipStyle = (active = false): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '8px 18px',
  margin: '6px',
  borderRadius: 24,
  border: `1.5px solid ${active ? '#8E6FA7' : '#D5D5D5'}`,
  background: active ? '#EBE3F2' : '#fff',
  color: active ? '#8E6FA7' : '#434343',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: active ? 600 : 400,
  transition: 'all 0.15s',
});

const primaryBtnStyle: React.CSSProperties = {
  background: '#8E6FA7',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '10px 28px',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  marginTop: 16,
};

export default function ArchWizard({ projectId, onComplete, onSkip }: Props) {
  const { patchArchData } = useArchStore();
  const [step, setStep] = useState<WizardStep>({ type: 'type-select' });
  const [archType, setArchType] = useState<'page' | 'component'>('page');
  const [subtype, setSubtype] = useState<'website' | 'app' | 'dashboard' | 'other'>('website');
  const [pageCount, setPageCount] = useState<number | 'ai'>(2);
  const [pages, setPages] = useState<ArchNode[]>([]);
  const [currentPageName, setCurrentPageName] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [_componentName, setComponentName] = useState('');
  const [selectedInteractions, setSelectedInteractions] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteZoneRef = useRef<HTMLDivElement>(null);
  const hiddenTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [uploadingFor, setUploadingFor] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [currentPageRef, setCurrentPageRef] = useState<{ id: string; thumbnailUrl: string } | null>(null);

  const handlePaste = (e: React.ClipboardEvent) => {
    console.log('[ArchWizard] paste event fired, uploadingFor=', uploadingFor);
    console.log('[ArchWizard] clipboard items:', Array.from(e.clipboardData?.items || []).map(i => i.type));
    if (uploadingFor === null) {
      console.log('[ArchWizard] paste ignored: uploadingFor is null');
      return;
    }
    const items = Array.from(e.clipboardData?.items || []);
    const imageItem = items.find(i => i.type.startsWith('image/'));
    if (!imageItem) {
      console.log('[ArchWizard] paste ignored: no image item in clipboard');
      return;
    }
    const file = imageItem.getAsFile();
    if (!file) return;
    console.log('[ArchWizard] uploading pasted image:', file.name, file.size);
    e.preventDefault();
    uploadReferenceImage(uploadingFor, file);
  };

  const uploadReferenceImage = async (_pageIndex: number, rawFile: File) => {
    setUploadStatus('uploading');
    const file = await compressImage(rawFile);
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch(`/api/projects/${projectId}/architecture/upload`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      console.log('[ArchWizard] upload success, id=', data.id);
      const thumbnailUrl = `/api/projects/${projectId}/files/${data.id}/thumbnail`;
      setCurrentPageRef({ id: data.id, thumbnailUrl });
      setUploadStatus('done');
    } catch (err) {
      console.error('[ArchWizard] upload failed:', err);
      setUploadStatus('error');
    }
  };

  const buildArchData = (finalPages: ArchNode[], finalEdges: ArchEdge[] = []): ArchData => ({
    type: archType,
    subtype: archType === 'page' ? subtype : undefined,
    aiDecidePages: pageCount === 'ai',
    nodes: finalPages.map((p, i) => ({ ...p, position: { x: i * 220, y: 100 } })),
    edges: finalEdges,
  });

  const finish = (finalPages: ArchNode[]) => {
    const data = buildArchData(finalPages);
    onComplete(data);
    patchArchData(projectId, data);
  };

  const question = (text: string) => (
    <p data-testid="wizard-question" style={{ fontSize: 22, fontWeight: 700, color: '#333', marginBottom: 24 }}>
      {text}
    </p>
  );

  const chip = (label: string, testId: string, onClick: () => void, active = false) => (
    <button key={label} data-testid={testId} style={chipStyle(active)} onClick={onClick}>
      {label}
    </button>
  );

  // ── Q1: type select ──
  if (step.type === 'type-select') {
    return (
      <div style={cardStyle}>
        {question('你想設計的是？')}
        <p style={{ fontSize: 13, color: '#999', marginBottom: 20, marginTop: -16 }}>
          先定義頁面結構，AI 生成時會更精準。不需要的話可以跳過。
        </p>
        <div>
          {chip('頁面（網站 / App）', 'wizard-option-page', () => { setArchType('page'); setStep({ type: 'page-subtype' }); })}
          {chip('元件（單一 UI 元件）', 'wizard-option-component', () => { setArchType('component'); setStep({ type: 'component-name' }); })}
        </div>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            style={{ marginTop: 24, background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: 13, padding: 0 }}
          >
            跳過，直接去 Design →
          </button>
        )}
      </div>
    );
  }

  // ── Q2: page subtype ──
  if (step.type === 'page-subtype') {
    const options: Array<['website' | 'app' | 'dashboard' | 'other', string]> = [
      ['website', '網站'], ['app', 'App'], ['dashboard', 'Dashboard'], ['other', '其他'],
    ];
    return (
      <div style={cardStyle}>
        {question('類型？')}
        <div>
          {options.map(([val, label]) =>
            chip(label, `wizard-option-${val}`, () => { setSubtype(val); setStep({ type: 'page-count' }); })
          )}
        </div>
      </div>
    );
  }

  // ── Q3: page count ──
  if (step.type === 'page-count') {
    const options: Array<[number | 'ai', string, string]> = [
      [1, '1', 'wizard-option-1'],
      [2, '2–3', 'wizard-option-2-3'],
      [4, '4–6', 'wizard-option-4-6'],
      [7, '7+', 'wizard-option-7+'],
      ['ai', '讓 AI 決定', 'wizard-option-ai'],
    ];
    return (
      <div style={cardStyle}>
        {question('大概有幾個頁面？')}
        <div>
          {options.map(([val, label, testId]) =>
            chip(label, testId, () => {
              setPageCount(val);
              if (val === 'ai') {
                setStep({ type: 'finish' });
              } else {
                setPages([]);
                setStep({ type: 'page-define', index: 0, totalPages: val as number });
              }
            })
          )}
        </div>
      </div>
    );
  }

  // ── Q4…Qn: define each page ──
  if (step.type === 'page-define') {
    const { index, totalPages } = step;
    const maxPages = totalPages || 10;
    const handleNext = () => {
      const name = currentPageName || customInput || `頁面 ${index + 1}`;
      const newPage: ArchNode = {
        id: `page-${Date.now()}-${index}`,
        nodeType: 'page',
        name,
        position: { x: 0, y: 0 },
        referenceFileId: currentPageRef?.id ?? null,
        referenceFileUrl: currentPageRef?.thumbnailUrl ?? null,
      };
      const newPages = [...pages, newPage];
      setPages(newPages);
      setCurrentPageName('');
      setCustomInput('');
      setCurrentPageRef(null);
      setUploadStatus('idle');
      setUploadingFor(null);
      if (index + 1 >= maxPages) {
        setStep({ type: 'finish' });
      } else {
        setStep({ type: 'page-define', index: index + 1, totalPages });
      }
    };

    return (
      <div style={cardStyle}>
        {question(`頁面 ${index + 1}${totalPages ? ` / ${totalPages}` : ''} — 名稱？`)}
        <div>
          {PAGE_NAME_CHIPS.filter(n => !pages.find(p => p.name === n)).map(name =>
            chip(name, `wizard-chip-${name}`, () => setCurrentPageName(name), currentPageName === name)
          )}
        </div>
        <input
          placeholder="自訂名稱..."
          value={customInput}
          onChange={e => { setCustomInput(e.target.value); setCurrentPageName(''); }}
          style={{ marginTop: 12, padding: '8px 12px', border: '1px solid #D5D5D5', borderRadius: 8, width: '100%', fontSize: 14, boxSizing: 'border-box' }}
        />
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 13, color: '#8C8C8C', marginBottom: 8 }}>參考圖（可選）</p>
          <div
            ref={pasteZoneRef}
            style={{ border: `1.5px dashed ${uploadingFor === pages.length ? '#9B59B6' : '#D5D5D5'}`, borderRadius: 8, padding: '12px 16px', cursor: 'pointer', fontSize: 13, color: '#8C8C8C', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            onClick={() => { setUploadingFor(pages.length); hiddenTextareaRef.current?.focus(); }}
          >
            <span>
              {uploadStatus === 'uploading' ? '⏳ 上傳中...' :
               uploadStatus === 'done' ? '✓ 已上傳' :
               uploadStatus === 'error' ? '❌ 上傳失敗，請重試' :
               uploadingFor !== null ? '已就緒，請 Ctrl+V 貼上截圖' : '點此啟用貼上 / Ctrl+V'}
            </span>
            <button
              type="button"
              style={{ marginLeft: 12, padding: '3px 10px', fontSize: 12, border: '1px solid #D5D5D5', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#666', flexShrink: 0 }}
              onClick={e => { e.stopPropagation(); setUploadingFor(pages.length); fileInputRef.current?.click(); }}
            >
              瀏覽…
            </button>
          </div>
          {currentPageRef && (
            <img
              src={currentPageRef.thumbnailUrl}
              alt="參考圖預覽"
              style={{ marginTop: 8, width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 6, border: '1px solid #E0E0E0' }}
            />
          )}
          {/* Hidden textarea to capture paste events — Chrome only fires paste on editable elements */}
          <textarea
            ref={hiddenTextareaRef}
            onPaste={handlePaste}
            style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none', top: 0, left: 0 }}
            aria-hidden="true"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadReferenceImage(index, f); }}
          />
        </div>
        <button data-testid="wizard-next" style={primaryBtnStyle} onClick={handleNext}>
          下一頁 →
        </button>
      </div>
    );
  }

  // ── Component: name ──
  if (step.type === 'component-name') {
    return (
      <div style={cardStyle}>
        {question('元件名稱？')}
        <div>
          {COMPONENT_CHIPS.map(name => chip(name, `wizard-chip-${name}`, () => { setComponentName(name); setStep({ type: 'component-interactions' }); }))}
        </div>
        <input
          placeholder="自訂名稱..."
          style={{ marginTop: 12, padding: '8px 12px', border: '1px solid #D5D5D5', borderRadius: 8, width: '100%', fontSize: 14, boxSizing: 'border-box' }}
          onKeyDown={e => { if (e.key === 'Enter') { setComponentName((e.target as HTMLInputElement).value); setStep({ type: 'component-interactions' }); }}}
        />
      </div>
    );
  }

  // ── Component: interactions ──
  if (step.type === 'component-interactions') {
    return (
      <div style={cardStyle}>
        {question('有哪些互動點？（可多選）')}
        <div>
          {INTERACTION_CHIPS.map(i => chip(i, `wizard-chip-${i}`, () => {
            setSelectedInteractions(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);
          }, selectedInteractions.includes(i)))}
        </div>
        <button
          data-testid="wizard-next"
          style={primaryBtnStyle}
          onClick={() => {
            if (selectedInteractions.length > 0) {
              setStep({ type: 'component-outcomes', interactionIndex: 0, interactions: selectedInteractions });
            } else {
              setStep({ type: 'component-states', interactions: [] });
            }
          }}
        >
          下一步 →
        </button>
      </div>
    );
  }

  // ── Component: outcomes per interaction ──
  if (step.type === 'component-outcomes') {
    const { interactionIndex, interactions } = step;
    const interaction = interactions[interactionIndex];
    return (
      <div style={cardStyle}>
        {question(`點了「${interaction}」會發生什麼？`)}
        <div>
          {OUTCOME_CHIPS.map(o => chip(o, `wizard-chip-${o}`, () => {
            if (interactionIndex + 1 < interactions.length) {
              setStep({ type: 'component-outcomes', interactionIndex: interactionIndex + 1, interactions });
            } else {
              setStep({ type: 'component-states', interactions: interactions.map((l, i) => ({ label: l, outcome: i === interactionIndex ? o : '自訂' })) });
            }
          }))}
        </div>
      </div>
    );
  }

  // ── Component: states ──
  if (step.type === 'component-states') {
    return (
      <div style={cardStyle}>
        {question('元件有哪些狀態？（可略過）')}
        <div>
          {STATE_CHIPS.map(s => chip(s, `wizard-chip-${s}`, () => {}))}
        </div>
        <button data-testid="wizard-next" style={primaryBtnStyle} onClick={() => setStep({ type: 'finish' })}>
          略過 / 完成
        </button>
      </div>
    );
  }

  // ── Finish ──
  if (step.type === 'finish') {
    return (
      <div style={cardStyle}>
        {question('架構完成！')}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            data-testid="wizard-finish-view"
            style={primaryBtnStyle}
            onClick={() => finish(pages)}
          >
            查看架構圖
          </button>
          <button
            data-testid="wizard-finish-generate"
            style={{ ...primaryBtnStyle, background: '#F7991C' }}
            onClick={() => finish(pages)}
          >
            直接開始生成
          </button>
        </div>
      </div>
    );
  }

  return null;
}
