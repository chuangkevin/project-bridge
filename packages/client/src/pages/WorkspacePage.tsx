import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ChatPanel, { ChatMessage } from '../components/ChatPanel';
import PreviewPanel from '../components/PreviewPanel';
import DeviceSizeSelector, { DeviceSize } from '../components/DeviceSizeSelector';
import Toast from '../components/Toast';

interface Project {
  id: string;
  name: string;
  share_token: string;
  currentHtml: string | null;
  currentVersion: number | null;
}

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [html, setHtml] = useState<string | null>(null);
  const [deviceSize, setDeviceSize] = useState<DeviceSize>('desktop');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const fetchProject = useCallback(async () => {
    try {
      const [projRes, convRes] = await Promise.all([
        fetch(`/api/projects/${id}`),
        fetch(`/api/projects/${id}/conversations`),
      ]);

      if (!projRes.ok) {
        if (projRes.status === 404) {
          setError('Project not found');
        } else {
          throw new Error('Failed to load project');
        }
        return;
      }

      const projData = await projRes.json();
      setProject(projData);
      setHtml(projData.currentHtml);

      if (convRes.ok) {
        const convData = await convRes.json();
        setMessages(
          convData.map((c: { id: string; role: string; content: string }) => ({
            id: c.id,
            role: c.role as 'user' | 'assistant',
            content: c.content,
          }))
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const handleNewMessages = useCallback((userMsg: ChatMessage, assistantMsg: ChatMessage) => {
    setMessages(prev => [...prev, userMsg, assistantMsg]);
  }, []);

  const handleHtmlGenerated = useCallback((newHtml: string) => {
    setHtml(newHtml);
  }, []);

  const handleShare = useCallback(async () => {
    if (!project?.share_token) return;
    const url = `${window.location.origin}/share/${project.share_token}`;
    try {
      await navigator.clipboard.writeText(url);
      setToastMsg('Link copied!');
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setToastMsg('Link copied!');
    }
  }, [project]);

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <p style={styles.loadingText}>Loading project...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div style={styles.errorContainer}>
        <h2 style={styles.errorTitle}>{error || 'Project not found'}</h2>
        <button style={styles.backBtn} onClick={() => navigate('/')}>Back to Home</button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <button style={styles.homeBtn} onClick={() => navigate('/')} title="Home" data-testid="home-btn">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 8l6-6 6 6M4 7v6h3v-3h2v3h3V7" />
            </svg>
          </button>
          <span style={styles.projectName}>{project.name}</span>
        </div>
        <div style={styles.toolbarCenter}>
          <DeviceSizeSelector value={deviceSize} onChange={setDeviceSize} />
        </div>
        <div style={styles.toolbarRight}>
          <button style={styles.shareBtn} onClick={handleShare} data-testid="share-btn">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
              <circle cx="3" cy="7" r="2" />
              <circle cx="11" cy="3" r="2" />
              <circle cx="11" cy="11" r="2" />
              <line x1="4.8" y1="6" x2="9.2" y2="3.8" />
              <line x1="4.8" y1="8" x2="9.2" y2="10.2" />
            </svg>
            Share
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={styles.body}>
        <div style={styles.chatPane}>
          <ChatPanel
            projectId={project.id}
            messages={messages}
            onNewMessages={handleNewMessages}
            onHtmlGenerated={handleHtmlGenerated}
          />
        </div>
        <div style={styles.previewPane}>
          <PreviewPanel html={html} deviceSize={deviceSize} />
        </div>
      </div>

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
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
  loadingContainer: {
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
  errorContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    gap: '16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  errorTitle: {
    color: '#1e293b',
    fontSize: '18px',
    fontWeight: 600,
  },
  backBtn: {
    padding: '8px 16px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    color: '#475569',
    fontSize: '14px',
    cursor: 'pointer',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e2e8f0',
    minHeight: '48px',
    flexShrink: 0,
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  toolbarCenter: {
    display: 'flex',
    alignItems: 'center',
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  homeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    color: '#64748b',
    cursor: 'pointer',
  },
  projectName: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#1e293b',
  },
  shareBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    color: '#475569',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  chatPane: {
    width: '300px',
    flexShrink: 0,
    borderRight: '1px solid #e2e8f0',
    overflow: 'hidden',
  },
  previewPane: {
    flex: 1,
    overflow: 'hidden',
  },
};
