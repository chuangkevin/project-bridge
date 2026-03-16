import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import PreviewPanel from '../components/PreviewPanel';
import DeviceSizeSelector, { DeviceSize } from '../components/DeviceSizeSelector';

interface SharedProject {
  name: string;
  html: string | null;
}

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [project, setProject] = useState<SharedProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [deviceSize, setDeviceSize] = useState<DeviceSize>('desktop');

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
        <PreviewPanel html={project.html} deviceSize={deviceSize} />
      </main>
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
};
