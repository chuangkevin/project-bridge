import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ChatPanel, { ChatMessage } from '../components/ChatPanel';
import DesignPanel from '../components/DesignPanel';
import PreviewPanel from '../components/PreviewPanel';
import DeviceSizeSelector, { DeviceSize } from '../components/DeviceSizeSelector';
import Toast from '../components/Toast';
import AnnotationEditor from '../components/AnnotationEditor';
import SpecPanel, { Annotation } from '../components/SpecPanel';
import { SpecData } from '../components/SpecForm';

interface Project {
  id: string;
  name: string;
  share_token: string;
  currentHtml: string | null;
  currentVersion: number | null;
  isMultiPage?: boolean;
  pages?: string[];
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
  const [leftTab, setLeftTab] = useState<'chat' | 'design'>('chat');
  const [designActive, setDesignActive] = useState(false);
  const [isMultiPage, setIsMultiPage] = useState(false);
  const [pages, setPages] = useState<string[]>([]);
  const [activePage, setActivePage] = useState<string>('');

  // Annotation state
  const [annotationMode, setAnnotationMode] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [editingAnnotation, setEditingAnnotation] = useState<{
    bridgeId: string;
    tagName: string;
    textContent: string;
    rect: { x: number; y: number; width: number; height: number };
  } | null>(null);

  // Spec panel state
  const [specPanelCollapsed, setSpecPanelCollapsed] = useState(false);
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null);
  const [savingSpec, setSavingSpec] = useState(false);

  const iframeContainerRef = useRef<HTMLDivElement>(null);

  const checkDesignActive = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${id}/design`);
      if (res.ok) {
        const data = await res.json();
        const profile = data.profile;
        const isActive = !!(
          profile &&
          (profile.description || profile.referenceAnalysis ||
            (profile.tokens && Object.keys(profile.tokens).length > 0))
        );
        setDesignActive(isActive);
      }
    } catch {
      // silently fail
    }
  }, [id]);

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
      setIsMultiPage(!!projData.isMultiPage);
      setPages(projData.pages || []);

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

  const fetchAnnotations = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${id}/annotations`);
      if (res.ok) {
        const data = await res.json();
        setAnnotations(data);
      }
    } catch {
      // silently fail
    }
  }, [id]);

  useEffect(() => {
    fetchProject();
    fetchAnnotations();
    checkDesignActive();
  }, [fetchProject, fetchAnnotations, checkDesignActive]);

  const handleNewMessages = useCallback((userMsg: ChatMessage, assistantMsg: ChatMessage) => {
    setMessages(prev => [...prev, userMsg, assistantMsg]);
  }, []);

  const handleHtmlGenerated = useCallback((data: { html: string; isMultiPage: boolean; pages: string[] }) => {
    setHtml(data.html);
    setIsMultiPage(data.isMultiPage);
    setPages(data.pages);
    setActivePage('');
  }, []);

  const handleNavigatePage = useCallback((page: string) => {
    setActivePage(page);
    const iframe = document.querySelector('iframe');
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'navigate', page }, '*');
    }
  }, []);

  const handleShare = useCallback(async () => {
    if (!project?.share_token) return;
    const url = `${window.location.origin}/share/${project.share_token}`;
    try {
      await navigator.clipboard.writeText(url);
      setToastMsg('Link copied!');
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setToastMsg('Link copied!');
    }
  }, [project]);

  // Annotation handlers
  const handleElementClick = useCallback((data: {
    bridgeId: string;
    tagName: string;
    textContent: string;
    rect: { x: number; y: number; width: number; height: number };
  }) => {
    // Calculate popup position relative to the page, offset from the iframe container
    const container = iframeContainerRef.current;
    const offsetX = container ? container.getBoundingClientRect().left : 300;
    const offsetY = container ? container.getBoundingClientRect().top : 48;
    setEditingAnnotation({
      ...data,
      rect: {
        ...data.rect,
        x: data.rect.x + offsetX,
        y: data.rect.y + offsetY,
      },
    });
  }, []);

  const handleSaveAnnotation = useCallback(async (text: string) => {
    if (!editingAnnotation || !id) return;
    try {
      const res = await fetch(`/api/projects/${id}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bridgeId: editingAnnotation.bridgeId,
          elementTag: editingAnnotation.tagName,
          elementText: editingAnnotation.textContent,
          content: text,
          rect: editingAnnotation.rect,
        }),
      });
      if (!res.ok) throw new Error('Failed to save annotation');
      setEditingAnnotation(null);
      fetchAnnotations();
    } catch {
      setToastMsg('Failed to save annotation');
    }
  }, [editingAnnotation, id, fetchAnnotations]);

  const handleHighlightElement = useCallback((bridgeId: string) => {
    // Post message to iframe to highlight element
    const iframe = document.querySelector('iframe');
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'highlight-element', bridgeId }, '*');
    }
  }, []);

  const handleSaveSpec = useCallback(async (annotationId: string, specData: SpecData) => {
    if (!id) return;
    setSavingSpec(true);
    try {
      const res = await fetch(`/api/projects/${id}/annotations/${annotationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specData }),
      });
      if (!res.ok) throw new Error('Failed to save spec');
      const updated = await res.json();
      setAnnotations(prev => prev.map(a => a.id === annotationId ? updated : a));
      setSelectedAnnotation(prev => prev?.id === annotationId ? updated : prev);
      setToastMsg('Spec saved');
    } catch {
      setToastMsg('Failed to save spec');
    } finally {
      setSavingSpec(false);
    }
  }, [id]);

  // Build annotation indicators for the iframe
  const annotationIndicators = annotations.map((ann, i) => ({
    bridgeId: ann.bridge_id,
    number: i + 1,
  }));

  const handleIndicatorClick = useCallback((bridgeId: string) => {
    const ann = annotations.find(a => a.bridge_id === bridgeId);
    if (ann) {
      setSelectedAnnotation(ann);
      setSpecPanelCollapsed(false);
    }
  }, [annotations]);

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
          {designActive && (
            <span style={styles.designActiveBadge} data-testid="design-active-badge">
              🎨 Design Active
            </span>
          )}
          <button
            style={{
              ...styles.annotateBtn,
              ...(annotationMode ? styles.annotateBtnActive : {}),
            }}
            onClick={() => setAnnotationMode(!annotationMode)}
            title={annotationMode ? 'Disable annotation mode' : 'Enable annotation mode'}
            data-testid="annotate-toggle"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M10.5 1.5l2 2L4 12H2v-2L10.5 1.5z" />
            </svg>
            Annotate
          </button>
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
          {/* Tab switcher */}
          <div style={styles.tabBar}>
            <button
              style={{ ...styles.tabBtn, ...(leftTab === 'chat' ? styles.tabBtnActive : {}) }}
              onClick={() => setLeftTab('chat')}
              data-testid="tab-chat"
            >
              Chat
            </button>
            <button
              style={{ ...styles.tabBtn, ...(leftTab === 'design' ? styles.tabBtnActive : {}) }}
              onClick={() => setLeftTab('design')}
              data-testid="tab-design"
            >
              Design
            </button>
          </div>
          <div style={styles.tabContent}>
            {leftTab === 'chat' ? (
              <ChatPanel
                projectId={project.id}
                messages={messages}
                onNewMessages={handleNewMessages}
                onHtmlGenerated={handleHtmlGenerated}
              />
            ) : (
              <DesignPanel
                projectId={project.id}
                onSaved={checkDesignActive}
              />
            )}
          </div>
        </div>
        <div style={styles.previewPane} ref={iframeContainerRef}>
          {isMultiPage && pages.length > 1 && (
            <div style={styles.pageTabBar}>
              {pages.map(page => (
                <button
                  key={page}
                  type="button"
                  style={{
                    ...styles.pageTab,
                    ...(activePage === page ? styles.pageTabActive : {}),
                  }}
                  onClick={() => handleNavigatePage(page)}
                  data-testid={`page-tab-${page}`}
                >
                  {page}
                </button>
              ))}
            </div>
          )}
          <PreviewPanel
            html={html}
            deviceSize={deviceSize}
            annotationMode={annotationMode}
            onElementClick={handleElementClick}
            onIndicatorClick={handleIndicatorClick}
            annotations={annotationIndicators}
          />
        </div>
        <SpecPanel
          annotations={annotations}
          selectedAnnotation={selectedAnnotation}
          onSelectAnnotation={setSelectedAnnotation}
          onHighlightElement={handleHighlightElement}
          onSaveSpec={handleSaveSpec}
          collapsed={specPanelCollapsed}
          onToggle={() => setSpecPanelCollapsed(!specPanelCollapsed)}
          savingSpec={savingSpec}
        />
      </div>

      {/* Annotation editor popup */}
      {editingAnnotation && (
        <AnnotationEditor
          elementLabel={`<${editingAnnotation.tagName.toLowerCase()}> ${editingAnnotation.textContent}`}
          position={{ x: editingAnnotation.rect.x, y: editingAnnotation.rect.y }}
          onSave={handleSaveAnnotation}
          onCancel={() => setEditingAnnotation(null)}
        />
      )}

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
  annotateBtn: {
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
  annotateBtnActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
    color: '#ffffff',
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
    display: 'flex',
    flexDirection: 'column',
  },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#ffffff',
    flexShrink: 0,
  },
  tabBtn: {
    flex: 1,
    padding: '8px 0',
    border: 'none',
    borderBottom: '2px solid transparent',
    backgroundColor: 'transparent',
    color: '#64748b',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'color 0.15s, border-color 0.15s',
  },
  tabBtnActive: {
    color: '#3b82f6',
    borderBottom: '2px solid #3b82f6',
  },
  tabContent: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  designActiveBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '3px 8px',
    backgroundColor: '#d1fae5',
    color: '#065f46',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 600,
  },
  previewPane: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  pageTabBar: {
    display: 'flex',
    gap: '4px',
    padding: '6px 12px',
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e2e8f0',
    flexShrink: 0,
    overflowX: 'auto',
  },
  pageTab: {
    padding: '4px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    backgroundColor: '#f8fafc',
    color: '#475569',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  pageTabActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
    color: '#ffffff',
  },
};
