import { useState } from 'react';
import SpecForm, { SpecData } from './SpecForm';

export interface Annotation {
  id: string;
  bridge_id: string;
  element_tag: string;
  element_text: string;
  content: string;
  spec_data: SpecData | null;
  rect?: { x: number; y: number; width: number; height: number };
  created_at?: string;
}

interface Props {
  annotations: Annotation[];
  selectedAnnotation: Annotation | null;
  onSelectAnnotation: (ann: Annotation) => void;
  onHighlightElement: (bridgeId: string) => void;
  onSaveSpec: (annotationId: string, specData: SpecData) => void;
  collapsed: boolean;
  onToggle: () => void;
  savingSpec?: boolean;
  projectId?: string;
}

export default function SpecPanel({
  annotations,
  selectedAnnotation,
  onSelectAnnotation,
  onHighlightElement,
  onSaveSpec,
  collapsed,
  onToggle,
  savingSpec,
  projectId,
}: Props) {
  const [tab, setTab] = useState<'annotations' | 'spec'>('annotations');
  const [searchQuery, setSearchQuery] = useState('');
  const [showRegenerateForm, setShowRegenerateForm] = useState(false);
  const [regenerateInstruction, setRegenerateInstruction] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateStatus, setRegenerateStatus] = useState<'idle' | 'done' | 'error'>('idle');
  const [regenerateError, setRegenerateError] = useState<string | null>(null);

  const handleExportMarkdown = () => {
    const title = 'Prototype Annotations';
    const lines: string[] = [`# ${title}`, ''];
    annotations.forEach((ann, i) => {
      const heading = ann.content.length > 50 ? ann.content.slice(0, 50) + '…' : ann.content;
      const bridgeLabel = ann.bridge_id || '未指定';
      const createdLabel = ann.created_at
        ? new Date(ann.created_at).toLocaleString('zh-TW')
        : '—';
      lines.push(`## ${i + 1}. ${heading}`);
      lines.push('');
      lines.push(`**元件:** ${bridgeLabel}  `);
      lines.push(`**內容:** ${ann.content}`);
      lines.push(`**建立時間:** ${createdLabel}`);
      lines.push('');
      lines.push('---');
      lines.push('');
    });
    const markdown = lines.join('\n');
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'annotations.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAnnotationClick = (ann: Annotation) => {
    onSelectAnnotation(ann);
    onHighlightElement(ann.bridge_id);
    setTab('spec');
  };

  const handleOpenRegenerate = () => {
    setRegenerateInstruction(selectedAnnotation?.content || '');
    setRegenerateStatus('idle');
    setRegenerateError(null);
    setShowRegenerateForm(true);
  };

  const handleCancelRegenerate = () => {
    setShowRegenerateForm(false);
    setRegenerateStatus('idle');
    setRegenerateError(null);
  };

  const handleRegenerate = async () => {
    if (!selectedAnnotation || !projectId) return;
    setRegenerating(true);
    setRegenerateStatus('idle');
    setRegenerateError(null);

    try {
      const url = `http://localhost:3001/api/projects/${projectId}/prototype/regenerate-component`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bridgeId: selectedAnnotation.bridge_id,
          instruction: regenerateInstruction,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || `Request failed: ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6);
          try {
            const data = JSON.parse(jsonStr);
            if (data.error) {
              throw new Error(data.error);
            }
            if (data.done && data.html) {
              const iframe = document.querySelector('iframe');
              if (iframe?.contentWindow) {
                iframe.contentWindow.postMessage(
                  { type: 'swap-component', bridgeId: selectedAnnotation.bridge_id, html: data.html },
                  '*'
                );
              }
              setRegenerateStatus('done');
              setShowRegenerateForm(false);
              setTimeout(() => setRegenerateStatus('idle'), 2500);
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== 'JSON parse error') {
              throw parseErr;
            }
          }
        }
      }
    } catch (err: unknown) {
      setRegenerateError(err instanceof Error ? err.message : 'Regeneration failed');
      setRegenerateStatus('error');
    } finally {
      setRegenerating(false);
    }
  };

  if (collapsed) {
    return (
      <div style={styles.collapsedBar}>
        <button style={styles.expandBtn} onClick={onToggle} title="Show spec panel" data-testid="spec-panel-expand">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 2L4 7l5 5" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.tabs}>
          <button
            style={tab === 'annotations' ? styles.activeTab : styles.tab}
            onClick={() => setTab('annotations')}
            data-testid="tab-annotations"
          >
            Annotations ({annotations.length})
          </button>
          <button
            style={tab === 'spec' ? styles.activeTab : styles.tab}
            onClick={() => setTab('spec')}
            data-testid="tab-spec"
          >
            Spec
          </button>
        </div>
        <button style={styles.collapseBtn} onClick={onToggle} title="Collapse panel" data-testid="spec-panel-collapse">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M5 2l5 5-5 5" />
          </svg>
        </button>
      </div>

      {tab === 'annotations' && (
        <div style={styles.list}>
          <div style={styles.searchWrapper}>
            <input
              style={styles.searchInput}
              type="search"
              placeholder="搜尋標注..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              data-testid="annotation-search"
            />
            {searchQuery && (
              <button
                type="button"
                style={styles.searchClear}
                onClick={() => setSearchQuery('')}
                title="清除搜尋"
                data-testid="annotation-search-clear"
              >
                ✕
              </button>
            )}
          </div>
          {searchQuery && (
            <p style={styles.searchCount}>
              顯示 {annotations.filter(a => a.content.toLowerCase().includes(searchQuery.toLowerCase())).length} / {annotations.length} 項
            </p>
          )}
          {annotations.length > 0 && (
            <div style={styles.exportRow}>
              <button
                type="button"
                style={styles.exportBtn}
                onClick={handleExportMarkdown}
                data-testid="export-annotations-btn"
              >
                ↓ 匯出標注
              </button>
            </div>
          )}
          {annotations.length === 0 && (
            <p style={styles.emptyText}>No annotations yet. Enable annotation mode to add one.</p>
          )}
          {annotations
            .filter(ann =>
              !searchQuery || ann.content.toLowerCase().includes(searchQuery.toLowerCase())
            )
            .map((ann, i) => (
            <div
              key={ann.id}
              style={{
                ...styles.annotationItem,
                ...(selectedAnnotation?.id === ann.id ? styles.selectedItem : {}),
              }}
              onClick={() => handleAnnotationClick(ann)}
            >
              <div style={styles.annotationNumber}>{i + 1}</div>
              <div style={styles.annotationContent}>
                <span style={styles.annotationTag}>{ann.element_tag}</span>
                <span style={styles.annotationLabel}>
                  {ann.element_text || '(no text)'}
                </span>
                <p style={styles.annotationPreview}>{ann.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'spec' && (
        <div style={styles.specContent}>
          {selectedAnnotation ? (
            <>
              <div style={styles.specHeader}>
                <span style={styles.annotationTag}>{selectedAnnotation.element_tag}</span>
                <span style={styles.specLabel}>{selectedAnnotation.element_text || '(no text)'}</span>
                <p style={styles.specAnnotation}>{selectedAnnotation.content}</p>
                {projectId && (
                  <div style={styles.regenerateActions}>
                    {!showRegenerateForm && !regenerating && (
                      <button
                        type="button"
                        style={styles.regenerateBtn}
                        onClick={handleOpenRegenerate}
                        data-testid="regenerate-btn"
                      >
                        &#x27F3; Regenerate
                      </button>
                    )}
                    {regenerateStatus === 'done' && !showRegenerateForm && (
                      <span style={styles.regenerateDone}>&#10003; Updated</span>
                    )}
                    {regenerating && (
                      <span style={styles.regeneratingLabel}>&#x27F3; Regenerating...</span>
                    )}
                    {showRegenerateForm && !regenerating && (
                      <div style={styles.regenerateForm}>
                        <textarea
                          style={styles.regenerateTextarea}
                          value={regenerateInstruction}
                          onChange={e => setRegenerateInstruction(e.target.value)}
                          placeholder="Describe what to change..."
                          rows={3}
                          autoFocus
                        />
                        {regenerateStatus === 'error' && regenerateError && (
                          <p style={styles.regenerateError}>{regenerateError}</p>
                        )}
                        <div style={styles.regenerateFormActions}>
                          <button type="button" style={styles.regenerateCancelBtn} onClick={handleCancelRegenerate}>
                            Cancel
                          </button>
                          <button
                            type="button"
                            style={{
                              ...styles.regenerateSubmitBtn,
                              opacity: regenerateInstruction.trim() ? 1 : 0.5,
                            }}
                            onClick={handleRegenerate}
                            disabled={!regenerateInstruction.trim()}
                            data-testid="regenerate-submit-btn"
                          >
                            Generate
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <SpecForm
                specData={selectedAnnotation.spec_data}
                onSave={(data) => onSaveSpec(selectedAnnotation.id, data)}
                saving={savingSpec}
              />
            </>
          ) : (
            <p style={styles.emptyText}>Select an annotation to view its spec.</p>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '300px',
    flexShrink: 0,
    borderLeft: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    height: '100%',
    overflow: 'hidden',
  },
  collapsedBar: {
    width: '32px',
    flexShrink: 0,
    borderLeft: '1px solid #e2e8f0',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: '8px',
    backgroundColor: '#ffffff',
  },
  expandBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
    borderRadius: '4px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 8px 0',
    borderBottom: '1px solid #e2e8f0',
  },
  tabs: {
    display: 'flex',
    gap: '0',
  },
  tab: {
    padding: '8px 12px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#64748b',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    fontFamily: 'inherit',
  },
  activeTab: {
    padding: '8px 12px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#3b82f6',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    borderBottom: '2px solid #3b82f6',
    fontFamily: 'inherit',
  },
  collapseBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
    borderRadius: '4px',
    marginBottom: '8px',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: '13px',
    textAlign: 'center',
    padding: '24px 16px',
    lineHeight: '1.5',
  },
  annotationItem: {
    display: 'flex',
    gap: '10px',
    padding: '10px',
    borderRadius: '8px',
    cursor: 'pointer',
    marginBottom: '4px',
    border: '1px solid transparent',
    transition: 'background-color 0.1s',
  },
  selectedItem: {
    backgroundColor: '#eff6ff',
    border: '1px solid #bfdbfe',
  },
  annotationNumber: {
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 700,
    flexShrink: 0,
  },
  annotationContent: {
    flex: 1,
    minWidth: 0,
  },
  annotationTag: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#94a3b8',
    fontFamily: '"SF Mono", "Fira Code", "Consolas", monospace',
    marginRight: '6px',
  },
  annotationLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#1e293b',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  annotationPreview: {
    margin: '4px 0 0',
    fontSize: '12px',
    color: '#64748b',
    lineHeight: '1.4',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  specContent: {
    flex: 1,
    overflowY: 'auto',
  },
  specHeader: {
    padding: '12px 16px',
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
  },
  specLabel: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#1e293b',
  },
  specAnnotation: {
    margin: '6px 0 0',
    fontSize: '13px',
    color: '#475569',
    lineHeight: '1.4',
  },
  regenerateActions: {
    marginTop: '10px',
  },
  regenerateBtn: {
    padding: '5px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    color: '#475569',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  regeneratingLabel: {
    fontSize: '12px',
    color: '#64748b',
    fontStyle: 'italic',
  },
  regenerateDone: {
    fontSize: '12px',
    color: '#16a34a',
    fontWeight: 600,
  },
  regenerateForm: {
    marginTop: '6px',
  },
  regenerateTextarea: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '13px',
    resize: 'none' as const,
    outline: 'none',
    fontFamily: 'inherit',
    lineHeight: '1.4',
    boxSizing: 'border-box' as const,
  },
  regenerateError: {
    margin: '6px 0 0',
    fontSize: '12px',
    color: '#ef4444',
  },
  regenerateFormActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '6px',
    marginTop: '8px',
  },
  regenerateCancelBtn: {
    padding: '5px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    color: '#475569',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  regenerateSubmitBtn: {
    padding: '5px 12px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  searchWrapper: {
    position: 'relative',
    marginBottom: '6px',
  },
  searchInput: {
    width: '100%',
    padding: '6px 28px 6px 8px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '12px',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box' as const,
    color: '#1e293b',
    backgroundColor: '#f8fafc',
  },
  searchClear: {
    position: 'absolute',
    right: '6px',
    top: '50%',
    transform: 'translateY(-50%)',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: '11px',
    color: '#94a3b8',
    padding: '0',
    lineHeight: 1,
  },
  searchCount: {
    margin: '0 0 6px',
    fontSize: '11px',
    color: '#64748b',
    textAlign: 'right' as const,
  },
  exportRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginBottom: '6px',
  },
  exportBtn: {
    padding: '4px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    color: '#475569',
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};
