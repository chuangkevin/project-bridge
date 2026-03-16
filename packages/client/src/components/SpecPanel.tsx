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
}: Props) {
  const [tab, setTab] = useState<'annotations' | 'spec'>('annotations');

  const handleAnnotationClick = (ann: Annotation) => {
    onSelectAnnotation(ann);
    onHighlightElement(ann.bridge_id);
    setTab('spec');
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
          {annotations.length === 0 && (
            <p style={styles.emptyText}>No annotations yet. Enable annotation mode to add one.</p>
          )}
          {annotations.map((ann, i) => (
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
};
