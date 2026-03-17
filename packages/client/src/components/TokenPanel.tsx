import { useState } from 'react';

export interface DesignToken {
  name: string;
  value: string;
}

interface TokenPanelProps {
  tokens: DesignToken[];
  loading: boolean;
  onClose: () => void;
}

function isColorValue(value: string): boolean {
  return /^#|^rgb|^hsl|^oklch|^color\(/i.test(value.trim());
}

export default function TokenPanel({ tokens, loading, onClose }: TokenPanelProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = async (name: string) => {
    const text = `var(${name})`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const input = document.createElement('input');
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopied(name);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <span style={styles.title}>Design Tokens</span>
          <button style={styles.closeBtn} onClick={onClose} title="Close">×</button>
        </div>

        <div style={styles.body}>
          {loading && (
            <div style={styles.emptyState}>Loading tokens…</div>
          )}
          {!loading && tokens.length === 0 && (
            <div style={styles.emptyState}>No CSS custom properties found in this prototype.</div>
          )}
          {!loading && tokens.length > 0 && (
            <ul style={styles.list}>
              {tokens.map((token) => {
                const isColor = isColorValue(token.value);
                return (
                  <li key={token.name} style={styles.item}>
                    <div style={styles.itemLeft}>
                      {isColor && (
                        <span
                          style={{
                            ...styles.colorSwatch,
                            backgroundColor: token.value,
                          }}
                          title={token.value}
                        />
                      )}
                      <span style={styles.tokenName}>{token.name}</span>
                    </div>
                    <div style={styles.itemRight}>
                      <span style={styles.tokenValue}>{token.value}</span>
                      <button
                        style={styles.copyBtn}
                        onClick={() => handleCopy(token.name)}
                        title={`Copy var(${token.name})`}
                      >
                        {copied === token.name ? '✓' : 'Copy'}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 9000,
    display: 'flex',
    flexDirection: 'column',
    pointerEvents: 'none',
  },
  panel: {
    position: 'absolute',
    top: 48,
    right: 0,
    bottom: 0,
    width: '300px',
    backgroundColor: '#ffffff',
    borderLeft: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
    pointerEvents: 'auto',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 14px',
    borderBottom: '1px solid #e2e8f0',
    flexShrink: 0,
  },
  title: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#1e293b',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '18px',
    color: '#94a3b8',
    lineHeight: 1,
    padding: '0 2px',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 0',
  },
  emptyState: {
    padding: '24px 16px',
    fontSize: '13px',
    color: '#94a3b8',
    textAlign: 'center',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '7px 14px',
    gap: '8px',
    borderBottom: '1px solid #f1f5f9',
  },
  itemLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
    flex: 1,
  },
  colorSwatch: {
    width: '14px',
    height: '14px',
    borderRadius: '3px',
    border: '1px solid rgba(0,0,0,0.12)',
    flexShrink: 0,
    display: 'inline-block',
  },
  tokenName: {
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
    fontSize: '12px',
    color: '#1e293b',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  itemRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  },
  tokenValue: {
    fontSize: '12px',
    color: '#64748b',
    maxWidth: '90px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  copyBtn: {
    padding: '2px 7px',
    border: '1px solid #e2e8f0',
    borderRadius: '4px',
    backgroundColor: '#f8fafc',
    color: '#475569',
    fontSize: '11px',
    cursor: 'pointer',
    flexShrink: 0,
    fontFamily: 'inherit',
  },
};
