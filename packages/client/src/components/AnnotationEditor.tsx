import { useState } from 'react';

interface Props {
  elementLabel: string;
  initialText?: string;
  position: { x: number; y: number };
  onSave: (text: string) => void;
  onCancel: () => void;
}

export default function AnnotationEditor({ elementLabel, initialText, position, onSave, onCancel }: Props) {
  const [text, setText] = useState(initialText || '');

  const handleSave = () => {
    if (!text.trim()) return;
    onSave(text.trim());
  };

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div
        style={{
          ...styles.popup,
          top: Math.min(position.y, window.innerHeight - 260),
          left: Math.min(position.x, window.innerWidth - 340),
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={styles.header}>
          <span style={styles.elementLabel}>{elementLabel}</span>
        </div>
        <textarea
          style={styles.textarea}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Add annotation..."
          rows={4}
          autoFocus
        />
        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button
            style={{ ...styles.saveBtn, opacity: text.trim() ? 1 : 0.5 }}
            onClick={handleSave}
            disabled={!text.trim()}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 1500,
  },
  popup: {
    position: 'absolute',
    width: '300px',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
    border: '1px solid #e2e8f0',
    padding: '16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    zIndex: 1501,
  },
  header: {
    marginBottom: '10px',
  },
  elementLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#64748b',
    fontFamily: '"SF Mono", "Fira Code", "Consolas", monospace',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    resize: 'none' as const,
    outline: 'none',
    fontFamily: 'inherit',
    lineHeight: '1.4',
    boxSizing: 'border-box' as const,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '12px',
  },
  cancelBtn: {
    padding: '6px 14px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    color: '#475569',
    fontSize: '13px',
    cursor: 'pointer',
  },
  saveBtn: {
    padding: '6px 14px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
