import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import PreviewPanel from '../components/PreviewPanel';
import DeviceSizeSelector, { DeviceSize } from '../components/DeviceSizeSelector';

interface ShareAnnotation {
  id: string;
  bridge_id: string;
  element_tag: string;
  element_text: string;
  content: string;
  spec_data: Record<string, string> | null;
}

interface SharedProject {
  name: string;
  html: string | null;
  annotations?: ShareAnnotation[];
}

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [project, setProject] = useState<SharedProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [deviceSize, setDeviceSize] = useState<DeviceSize>('desktop');
  const [popover, setPopover] = useState<ShareAnnotation | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/share/${token}`);
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        setProject(data);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const annotations = project?.annotations || [];

  const annotationIndicators = annotations.map((ann, i) => ({
    bridgeId: ann.bridge_id,
    number: i + 1,
  }));

  const handleIndicatorClick = useCallback((bridgeId: string) => {
    const ann = annotations.find(a => a.bridge_id === bridgeId);
    if (ann) {
      setPopover(ann);
    }
  }, [annotations]);

  if (loading) {
    return (
      <div style={styles.center}>
        <p style={styles.loadingText}>Loading shared project...</p>
      </div>
    );
  }

  if (notFound || !project) {
    return (
      <div style={styles.center}>
        <div style={styles.errorCard}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#94a3b8" strokeWidth="2">
            <circle cx="24" cy="24" r="20" />
            <line x1="16" y1="16" x2="32" y2="32" />
            <line x1="32" y1="16" x2="16" y2="32" />
          </svg>
          <h2 style={styles.errorTitle}>Project not found</h2>
          <p style={styles.errorText}>
            This shared link is invalid or the project has been deleted.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <span style={styles.projectName}>{project.name}</span>
        <DeviceSizeSelector value={deviceSize} onChange={setDeviceSize} />
      </header>
      <main style={styles.main}>
        <PreviewPanel
          html={project.html}
          deviceSize={deviceSize}
          annotations={annotationIndicators}
          onIndicatorClick={handleIndicatorClick}
        />
      </main>

      {/* Annotation popover */}
      {popover && (
        <div style={styles.popoverOverlay} onClick={() => setPopover(null)}>
          <div style={styles.popoverCard} onClick={e => e.stopPropagation()}>
            <div style={styles.popoverHeader}>
              <span style={styles.popoverTag}>{popover.element_tag}</span>
              <span style={styles.popoverText}>{popover.element_text || '(no text)'}</span>
              <button style={styles.popoverClose} onClick={() => setPopover(null)}>x</button>
            </div>
            <p style={styles.popoverContent}>{popover.content}</p>
            {popover.spec_data && Object.keys(popover.spec_data).length > 0 && (
              <div style={styles.popoverSpec}>
                <h4 style={styles.popoverSpecTitle}>Spec Data</h4>
                {Object.entries(popover.spec_data).map(([key, value]) => (
                  value ? (
                    <div key={key} style={styles.specRow}>
                      <span style={styles.specKey}>{key}:</span>
                      <span style={styles.specValue}>{value}</span>
                    </div>
                  ) : null
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  loadingText: {
    color: '#64748b',
    fontSize: '14px',
  },
  errorCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '48px',
    textAlign: 'center',
  },
  errorTitle: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 600,
    color: '#1e293b',
  },
  errorText: {
    margin: 0,
    fontSize: '14px',
    color: '#64748b',
    maxWidth: '320px',
    lineHeight: '1.5',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 20px',
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e2e8f0',
    flexShrink: 0,
  },
  projectName: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#1e293b',
  },
  main: {
    flex: 1,
    overflow: 'hidden',
  },
  popoverOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1500,
  },
  popoverCard: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '20px',
    width: '400px',
    maxWidth: '90vw',
    maxHeight: '80vh',
    overflowY: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
  },
  popoverHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
  },
  popoverTag: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#94a3b8',
    fontFamily: '"SF Mono", "Fira Code", "Consolas", monospace',
  },
  popoverText: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#1e293b',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  popoverClose: {
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '14px',
    flexShrink: 0,
  },
  popoverContent: {
    margin: '0 0 16px',
    fontSize: '14px',
    color: '#475569',
    lineHeight: '1.5',
  },
  popoverSpec: {
    padding: '12px',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
  },
  popoverSpecTitle: {
    margin: '0 0 8px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#1e293b',
  },
  specRow: {
    display: 'flex',
    gap: '8px',
    fontSize: '12px',
    marginBottom: '4px',
  },
  specKey: {
    color: '#64748b',
    fontWeight: 500,
    minWidth: '80px',
  },
  specValue: {
    color: '#1e293b',
    flex: 1,
    wordBreak: 'break-word' as const,
  },
};
