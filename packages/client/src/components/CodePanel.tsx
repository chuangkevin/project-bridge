import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Highlight, themes } from 'prism-react-renderer';

interface CodePanelProps {
  html: string;
  pages: string[];
  activePage?: string;
  onPageChange?: (page: string) => void;
}

const LINE_THRESHOLD = 5000;

/** Parse `<!-- PAGE: name -->` markers and return { name, startLine } entries */
function parsePageSections(code: string): { name: string; lineIndex: number }[] {
  const lines = code.split('\n');
  const sections: { name: string; lineIndex: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/<!--\s*PAGE:\s*(.+?)\s*-->/);
    if (match) {
      sections.push({ name: match[1].trim(), lineIndex: i });
    }
  }
  return sections;
}

/** Get the code slice for a given page */
function getPageCode(code: string, pageName: string, sections: { name: string; lineIndex: number }[]): string {
  const lines = code.split('\n');
  const idx = sections.findIndex(s => s.name === pageName);
  if (idx === -1) return code;
  const start = sections[idx].lineIndex;
  const end = idx + 1 < sections.length ? sections[idx + 1].lineIndex : lines.length;
  return lines.slice(start, end).join('\n');
}

export default function CodePanel({ html, pages: _pages, activePage, onPageChange: _onPageChange }: CodePanelProps) {
  void _pages; void _onPageChange;
  const [wordWrap, setWordWrap] = useState(false);
  const [copied, setCopied] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const codeRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const lines = useMemo(() => html.split('\n'), [html]);
  const isLargeFile = lines.length > LINE_THRESHOLD;
  const sections = useMemo(() => parsePageSections(html), [html]);

  // Scroll to active page section
  useEffect(() => {
    if (!activePage || !codeRef.current) return;
    const section = sections.find(s => s.name === activePage);
    if (!section) return;
    // Find the line element by data-line attribute
    const lineEl = codeRef.current.querySelector(`[data-line="${section.lineIndex}"]`);
    if (lineEl) {
      lineEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activePage, sections]);

  // Ctrl+F handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setSearchQuery('');
      }
    };
    const el = codeRef.current;
    if (el) {
      el.addEventListener('keydown', handler);
      // Also listen on window for when panel is focused
      window.addEventListener('keydown', handler);
    }
    return () => {
      if (el) el.removeEventListener('keydown', handler);
      window.removeEventListener('keydown', handler);
    };
  }, []);

  // Compute search matches
  const searchMatches = useMemo(() => {
    if (!searchQuery) return [];
    const matches: { lineIndex: number; startCol: number }[] = [];
    const q = searchQuery.toLowerCase();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      let col = 0;
      while (true) {
        const found = line.indexOf(q, col);
        if (found === -1) break;
        matches.push({ lineIndex: i, startCol: found });
        col = found + 1;
      }
    }
    return matches;
  }, [searchQuery, lines]);

  // Scroll to current match
  useEffect(() => {
    if (searchMatches.length === 0 || !codeRef.current) return;
    const current = searchMatches[matchIndex];
    if (!current) return;
    const lineEl = codeRef.current.querySelector(`[data-line="${current.lineIndex}"]`);
    if (lineEl) lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [matchIndex, searchMatches]);

  const handleCopy = useCallback(() => {
    const textToCopy = activePage && sections.length > 0
      ? getPageCode(html, activePage, sections)
      : html;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [html, activePage, sections]);

  const handleSearchNav = (direction: 'next' | 'prev') => {
    if (searchMatches.length === 0) return;
    if (direction === 'next') {
      setMatchIndex(i => (i + 1) % searchMatches.length);
    } else {
      setMatchIndex(i => (i - 1 + searchMatches.length) % searchMatches.length);
    }
  };

  // Highlight search matches in a token text
  const highlightToken = (text: string, lineIndex: number, tokenStart: number): React.ReactNode => {
    if (!searchQuery || searchMatches.length === 0) return text;
    const q = searchQuery.toLowerCase();
    const qLen = q.length;
    const tokenEnd = tokenStart + text.length;
    // Find matches that overlap this token
    const overlapping = searchMatches.filter(
      m => m.lineIndex === lineIndex && m.startCol < tokenEnd && m.startCol + qLen > tokenStart
    );
    if (overlapping.length === 0) return text;

    const parts: React.ReactNode[] = [];
    let pos = 0;
    for (const m of overlapping) {
      const hlStart = Math.max(0, m.startCol - tokenStart);
      const hlEnd = Math.min(text.length, m.startCol + qLen - tokenStart);
      if (hlStart > pos) parts.push(text.slice(pos, hlStart));
      const isCurrent = searchMatches[matchIndex]?.lineIndex === lineIndex && searchMatches[matchIndex]?.startCol === m.startCol;
      parts.push(
        <mark
          key={`${lineIndex}-${m.startCol}`}
          style={{
            backgroundColor: isCurrent ? '#f59e0b' : '#fde68a',
            color: '#1e293b',
            borderRadius: '2px',
          }}
        >
          {text.slice(hlStart, hlEnd)}
        </mark>
      );
      pos = hlEnd;
    }
    if (pos < text.length) parts.push(text.slice(pos));
    return <>{parts}</>;
  };

  return (
    <div style={styles.container} ref={codeRef} tabIndex={0} data-testid="code-panel">
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          {searchOpen && (
            <div style={styles.searchBar}>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setMatchIndex(0); }}
                placeholder="搜尋..."
                style={styles.searchInput}
                data-testid="code-search-input"
              />
              {searchMatches.length > 0 && (
                <span style={styles.searchCount}>
                  {matchIndex + 1}/{searchMatches.length}
                </span>
              )}
              <button type="button" style={styles.searchNavBtn} onClick={() => handleSearchNav('prev')} title="上一個">
                &#x25B2;
              </button>
              <button type="button" style={styles.searchNavBtn} onClick={() => handleSearchNav('next')} title="下一個">
                &#x25BC;
              </button>
              <button type="button" style={styles.searchNavBtn} onClick={() => { setSearchOpen(false); setSearchQuery(''); }} title="關閉">
                ✕
              </button>
            </div>
          )}
        </div>
        <div style={styles.toolbarRight}>
          <button
            type="button"
            style={styles.toolBtn}
            onClick={() => { setSearchOpen(o => !o); setTimeout(() => searchInputRef.current?.focus(), 50); }}
            title="搜尋 (Ctrl+F)"
            data-testid="code-search-btn"
          >
            🔍
          </button>
          <button
            type="button"
            style={styles.toolBtn}
            onClick={() => setWordWrap(w => !w)}
            title={wordWrap ? '取消自動換行' : '自動換行'}
            data-testid="code-wrap-btn"
          >
            {wordWrap ? '↩' : '→'}
          </button>
          <button
            type="button"
            style={{ ...styles.toolBtn, ...(copied ? styles.toolBtnCopied : {}) }}
            onClick={handleCopy}
            title="複製程式碼"
            data-testid="code-copy-btn"
          >
            {copied ? '✓ 已複製' : '📋 複製'}
          </button>
        </div>
      </div>

      {/* Code area */}
      <div style={{ ...styles.codeArea, ...(wordWrap ? { whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const } : {}) }}>
        {isLargeFile ? (
          <pre style={styles.plainPre}>
            {lines.map((line, i) => (
              <div key={i} data-line={i} style={styles.lineRow}>
                <span style={styles.lineNumber}>{i + 1}</span>
                <span>{line}</span>
              </div>
            ))}
          </pre>
        ) : (
          <Highlight theme={themes.nightOwl} code={html} language="html">
            {({ style, tokens, getLineProps, getTokenProps }) => (
              <pre style={{ ...style, ...styles.pre }}>
                {tokens.map((line, i) => {
                  const lineProps = getLineProps({ line, key: i });
                  let colOffset = 0;
                  return (
                    <div
                      key={i}
                      {...lineProps}
                      data-line={i}
                      style={{
                        ...lineProps.style,
                        display: 'flex',
                        minHeight: '20px',
                      }}
                    >
                      <span style={styles.lineNumber}>{i + 1}</span>
                      <span style={{ flex: 1 }}>
                        {line.map((token, key) => {
                          const tokenProps = getTokenProps({ token, key });
                          const currentColOffset = colOffset;
                          colOffset += token.content.length;
                          return (
                            <span key={key} {...tokenProps}>
                              {highlightToken(token.content, i, currentColOffset)}
                            </span>
                          );
                        })}
                      </span>
                    </div>
                  );
                })}
              </pre>
            )}
          </Highlight>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    backgroundColor: '#1e1e2e',
    color: '#d4d4d4',
    fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
    fontSize: '13px',
    overflow: 'hidden',
    outline: 'none',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 8px',
    backgroundColor: '#181825',
    borderBottom: '1px solid #313244',
    flexShrink: 0,
    minHeight: '32px',
    gap: '8px',
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  },
  searchBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: '#313244',
    borderRadius: '4px',
    padding: '2px 6px',
  },
  searchInput: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#d4d4d4',
    fontSize: '12px',
    outline: 'none',
    width: '140px',
    fontFamily: 'inherit',
  },
  searchCount: {
    fontSize: '11px',
    color: '#a6adc8',
    flexShrink: 0,
  },
  searchNavBtn: {
    background: 'none',
    border: 'none',
    color: '#a6adc8',
    cursor: 'pointer',
    fontSize: '10px',
    padding: '2px 4px',
    lineHeight: 1,
  },
  toolBtn: {
    background: 'none',
    border: '1px solid #45475a',
    borderRadius: '4px',
    color: '#a6adc8',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '3px 8px',
    whiteSpace: 'nowrap',
  },
  toolBtnCopied: {
    backgroundColor: '#166534',
    borderColor: '#22c55e',
    color: '#bbf7d0',
  },
  codeArea: {
    flex: 1,
    overflow: 'auto',
    whiteSpace: 'pre',
  },
  pre: {
    margin: 0,
    padding: '8px 0',
    fontSize: '13px',
    lineHeight: '20px',
    fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
    backgroundColor: 'transparent',
  },
  plainPre: {
    margin: 0,
    padding: '8px 0',
    fontSize: '13px',
    lineHeight: '20px',
    fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
    backgroundColor: '#1e1e2e',
    color: '#d4d4d4',
  },
  lineRow: {
    display: 'flex',
    minHeight: '20px',
  },
  lineNumber: {
    display: 'inline-block',
    width: '48px',
    textAlign: 'right',
    paddingRight: '12px',
    color: '#585b70',
    userSelect: 'none',
    flexShrink: 0,
    fontSize: '12px',
  },
};
