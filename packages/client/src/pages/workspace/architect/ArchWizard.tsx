import { useState } from 'react';

interface Props {
  onSend: (text: string, attachmentIds: string[]) => void;
}

interface SiteType {
  label: string;
  pages: string[];
}

const SITE_TYPES: SiteType[] = [
  { label: '電商', pages: ['首頁', '商品列表', '商品詳情', '購物車', '結帳', '關於我們'] },
  { label: '餐廳', pages: ['首頁', '菜單', '關於我們', '線上預訂', '聯絡我們'] },
  { label: '作品集', pages: ['首頁', '關於我', '作品展示', '服務項目', '聯絡我'] },
  { label: 'SaaS', pages: ['首頁', '功能介紹', '定價方案', '常見問題', '登入', '註冊'] },
  { label: '部落格', pages: ['首頁', '文章列表', '文章詳情', '關於作者', '標籤分類'] },
  { label: '其他', pages: [] },
];

export default function ArchWizard({ onSend }: Props) {
  const [selectedType, setSelectedType] = useState<SiteType | null>(null);
  const [customDesc, setCustomDesc] = useState('');
  const [generating, setGenerating] = useState(false);

  const suggestedPages = selectedType?.pages ?? [];

  const handleGenerate = () => {
    if (!selectedType) return;
    setGenerating(true);

    let message: string;
    if (selectedType.label === '其他') {
      if (!customDesc.trim()) {
        setGenerating(false);
        return;
      }
      message = `請幫我建立一個網站的頁面結構：${customDesc.trim()}`;
    } else if (suggestedPages.length > 0) {
      const pagesStr = suggestedPages.join('、');
      message = `請幫我建立一個${selectedType.label}網站的頁面結構，包含：${pagesStr}${customDesc.trim() ? `。補充說明：${customDesc.trim()}` : ''}`;
    } else {
      message = `請幫我建立一個${selectedType.label}網站的頁面結構`;
    }

    onSend(message, []);
    // Note: generating state will be cleared when parent re-renders with displayGraph set
  };

  const canGenerate = selectedType !== null && (selectedType.label !== '其他' || customDesc.trim() !== '');

  return (
    <div className="arch-wizard">
      <div className="arch-wizard__title">選擇網站類型，快速建立頁面架構</div>

      <div className="arch-wizard__types">
        {SITE_TYPES.map(st => (
          <button
            key={st.label}
            className="arch-wizard__type-btn"
            data-selected={selectedType?.label === st.label ? 'true' : 'false'}
            onClick={() => setSelectedType(st)}
          >
            {st.label}
          </button>
        ))}
      </div>

      {selectedType && suggestedPages.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>建議頁面</div>
          <div className="arch-wizard__pages">
            {suggestedPages.map(p => (
              <span key={p} className="arch-wizard__page-chip">{p}</span>
            ))}
          </div>
        </div>
      )}

      {selectedType && (
        <div style={{ width: '100%', maxWidth: 400 }}>
          <textarea
            placeholder={
              selectedType.label === '其他'
                ? '請描述您想建立的網站…'
                : '補充說明（選填）：特殊需求、色調、目標受眾…'
            }
            value={customDesc}
            onChange={e => setCustomDesc(e.target.value)}
            rows={3}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-primary)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontSize: 12,
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      <button
        className="arch-wizard__generate-btn"
        onClick={handleGenerate}
        disabled={!canGenerate || generating}
        style={{
          opacity: !canGenerate || generating ? 0.5 : 1,
          cursor: !canGenerate || generating ? 'not-allowed' : 'pointer',
        }}
      >
        {generating ? '生成中…' : '生成架構圖'}
      </button>

      {!selectedType && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          或直接在下方對話框輸入描述，讓 AI 自由規劃
        </div>
      )}
    </div>
  );
}
