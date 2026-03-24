import { useState } from 'react';

interface CodeFileTreeProps {
  pages: string[];
  activePage: string | null;
  onSelect: (page: string) => void;
}

export default function CodeFileTree({ pages, activePage, onSelect }: CodeFileTreeProps) {
  const [pagesExpanded, setPagesExpanded] = useState(true);

  // Don't render for single-page prototypes
  if (pages.length <= 1) return null;

  return (
    <div style={styles.container} data-testid="code-file-tree">
      {/* Pages folder */}
      <button
        type="button"
        style={styles.folderBtn}
        onClick={() => setPagesExpanded(e => !e)}
      >
        <span style={{ fontSize: '12px' }}>{pagesExpanded ? '▾' : '▸'}</span>
        <span style={styles.folderIcon}>📁</span>
        <span style={styles.folderLabel}>pages/</span>
      </button>

      {pagesExpanded && pages.map(page => (
        <button
          key={page}
          type="button"
          style={{
            ...styles.fileBtn,
            ...(activePage === page ? styles.fileBtnActive : {}),
          }}
          onClick={() => onSelect(page)}
          title={page}
          data-testid={`code-tree-page-${page}`}
        >
          <span style={styles.fileIcon}>📄</span>
          <span style={styles.fileName}>{page}</span>
        </button>
      ))}

      {/* Virtual entries for styles and scripts */}
      <button
        type="button"
        style={styles.rootFileBtn}
        onClick={() => {/* scroll to styles - no-op for now */}}
      >
        <span style={styles.fileIcon}>📄</span>
        <span style={styles.fileName}>styles</span>
      </button>
      <button
        type="button"
        style={styles.rootFileBtn}
        onClick={() => {/* scroll to scripts - no-op for now */}}
      >
        <span style={styles.fileIcon}>📄</span>
        <span style={styles.fileName}>scripts</span>
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '200px',
    flexShrink: 0,
    backgroundColor: '#1e1e2e',
    borderRight: '1px solid #313244',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    padding: '8px 0',
    fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
    fontSize: '12px',
  },
  folderBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    width: '100%',
    padding: '4px 10px',
    border: 'none',
    background: 'none',
    color: '#cdd6f4',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: '12px',
    fontFamily: 'inherit',
  },
  folderIcon: {
    fontSize: '13px',
    lineHeight: 1,
  },
  folderLabel: {
    fontWeight: 600,
    color: '#cdd6f4',
  },
  fileBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    width: '100%',
    padding: '3px 10px 3px 28px',
    border: 'none',
    background: 'none',
    color: '#a6adc8',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: '12px',
    fontFamily: 'inherit',
    borderRadius: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  fileBtnActive: {
    backgroundColor: '#313244',
    color: '#cba6f7',
  },
  rootFileBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    width: '100%',
    padding: '3px 10px',
    border: 'none',
    background: 'none',
    color: '#a6adc8',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: '12px',
    fontFamily: 'inherit',
    marginTop: '2px',
  },
  fileIcon: {
    fontSize: '12px',
    lineHeight: 1,
    flexShrink: 0,
  },
  fileName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};
