interface Props {
  html: string | null;
  deviceSize: 'desktop' | 'tablet' | 'mobile';
}

export default function PreviewPanel({ html, deviceSize }: Props) {
  if (!html) {
    return (
      <div style={styles.emptyState}>
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none" stroke="#cbd5e1" strokeWidth="1.5">
          <rect x="10" y="14" width="60" height="44" rx="4" />
          <line x1="10" y1="58" x2="70" y2="58" />
          <rect x="30" y="58" width="20" height="4" rx="1" />
          <circle cx="40" cy="36" r="10" strokeDasharray="4 3" />
          <line x1="36" y1="36" x2="44" y2="36" />
          <line x1="40" y1="32" x2="40" y2="40" />
        </svg>
        <p style={styles.emptyText}>Describe your UI in the chat panel to generate a prototype</p>
      </div>
    );
  }

  const iframeStyle: React.CSSProperties = (() => {
    switch (deviceSize) {
      case 'tablet':
        return {
          width: '768px',
          height: '1024px',
          maxWidth: '100%',
          maxHeight: '100%',
          border: '2px solid #e2e8f0',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
        };
      case 'mobile':
        return {
          width: '375px',
          height: '667px',
          maxWidth: '100%',
          maxHeight: '100%',
          border: '2px solid #e2e8f0',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
        };
      default:
        return {
          width: '100%',
          height: '100%',
          border: 'none',
        };
    }
  })();

  return (
    <div style={styles.container}>
      <iframe
        style={iframeStyle}
        sandbox="allow-scripts"
        srcDoc={html}
        title="Prototype Preview"
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    overflow: 'auto',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '16px',
    padding: '32px',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: '15px',
    textAlign: 'center',
    maxWidth: '300px',
    lineHeight: '1.5',
    margin: 0,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
};
