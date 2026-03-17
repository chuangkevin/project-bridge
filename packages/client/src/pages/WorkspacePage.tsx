import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ChatPanel, { ChatMessage } from '../components/ChatPanel';
import DesignPanel from '../components/DesignPanel';
import StyleTweakerPanel from '../components/StyleTweakerPanel';
import PreviewPanel from '../components/PreviewPanel';
import DeviceSizeSelector, { DeviceSize } from '../components/DeviceSizeSelector';
import Toast from '../components/Toast';
import AnnotationEditor from '../components/AnnotationEditor';
import SpecPanel, { Annotation } from '../components/SpecPanel';
import VersionHistoryPanel from '../components/VersionHistoryPanel';
import TokenPanel, { DesignToken } from '../components/TokenPanel';
import { SpecData } from '../components/SpecForm';

// Strip [Attached files] block from user message display content
function stripFileContent(content: string): string {
  // Remove [Attached files]\n...--- end ---\n\n prefix
  if (content.startsWith('[Attached files]')) {
    const lastEnd = content.lastIndexOf('--- end ---');
    if (lastEnd !== -1) {
      return content.slice(lastEnd + '--- end ---'.length).replace(/^\n+/, '');
    }
  }
  return content;
}

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
  const [leftTab, setLeftTab] = useState<'chat' | 'design' | 'style'>('chat');
  const [designActive, setDesignActive] = useState(false);
  const [isMultiPage, setIsMultiPage] = useState(false);
  const [pages, setPages] = useState<string[]>([]);
  const [activePage, setActivePage] = useState<string>('');

  const [showVersionHistory, setShowVersionHistory] = useState(false);

  // Token panel state
  const [showTokens, setShowTokens] = useState(false);
  const [tokens, setTokens] = useState<DesignToken[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);

  // Annotation state
  const [annotationMode, setAnnotationMode] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [editingAnnotation, setEditingAnnotation] = useState<{
    bridgeId: string;
    tagName: string;
    textContent: string;
    rect: { x: number; y: number; width: number; height: number };
  } | null>(null);

  // Quick regenerate popup state (Pencil-style: click element → describe change → done)
  const [quickRegen, setQuickRegen] = useState<{
    bridgeId: string;
    tagName: string;
    rect: { x: number; y: number };
    instruction: string;
    loading: boolean;
    error: string | null;
    showAnnotationForm: boolean;
  } | null>(null);

  // Prompt history chips for quick regen (shared localStorage key with ChatPanel)
  const [regenHistory, setRegenHistory] = useState<string[]>([]);

  // Spec panel state
  const [specPanelCollapsed, setSpecPanelCollapsed] = useState(false);
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null);
  const [savingSpec, setSavingSpec] = useState(false);

  const iframeContainerRef = useRef<HTMLDivElement>(null);

  // Device frame state
  const [deviceFrame, setDeviceFrame] = useState<'desktop' | 'mobile' | 'tablet'>('desktop');

  // Export dropdown state
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Whether this project has uploaded files with visual analysis (design spec)
  const [hasDesignSpec, setHasDesignSpec] = useState(false);

  // Focus mode state
  const [focusMode, setFocusMode] = useState(false);

  // Inline rename state
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');

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

  const checkDesignSpec = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${id}/upload/spec-status`);
      if (res.ok) {
        const data = await res.json();
        setHasDesignSpec(!!data.hasVisualAnalysis);
      }
    } catch {
      // silently fail
    }
  }, [id]);

  const handleOpenTokens = useCallback(async () => {
    setShowTokens(true);
    setTokensLoading(true);
    try {
      const res = await fetch(`/api/projects/${id}/prototype/tokens`);
      if (res.ok) {
        const data = await res.json();
        setTokens(data.tokens || []);
      }
    } catch {
      setTokens([]);
    } finally {
      setTokensLoading(false);
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
          convData.map((c: { id: string; role: string; content: string; message_type?: string }) => ({
            id: c.id,
            role: c.role as 'user' | 'assistant',
            content: stripFileContent(c.content),
            messageType: (c.message_type as 'user' | 'generate' | 'answer') || undefined,
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
    checkDesignSpec();
  }, [fetchProject, fetchAnnotations, checkDesignActive, checkDesignSpec]);

  // Load prompt history when quick regen popup opens
  useEffect(() => {
    if (quickRegen && !quickRegen.showAnnotationForm) {
      try {
        const raw = localStorage.getItem('pb-prompt-history');
        const parsed = raw ? JSON.parse(raw) : [];
        setRegenHistory(Array.isArray(parsed) ? parsed : []);
      } catch {
        // silently fail
      }
    }
  }, [quickRegen?.bridgeId, quickRegen?.showAnnotationForm]);

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
      iframe.contentWindow.postMessage({ type: 'navigate-page', page }, '*');
    }
  }, []);

  const injectStyles = useCallback((css: string) => {
    const iframe = document.querySelector('iframe');
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'inject-styles', css }, '*');
    }
  }, []);

  const handleSaveStyles = useCallback(async (css: string) => {
    const res = await fetch(`/api/projects/${id}/prototype/styles`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ css }),
    });
    if (!res.ok) throw new Error('Save failed');
  }, [id]);

  const handleExport = useCallback(() => {
    if (!html || !project) return;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[^a-z0-9\u4e00-\u9fff]/gi, '-')}-prototype.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [html, project]);

  const handleOpenInNewTab = useCallback(() => {
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    // Revoke after a short delay to allow the browser to load the page
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, [html]);

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
    const container = iframeContainerRef.current;
    const offsetX = container ? container.getBoundingClientRect().left : 300;
    const offsetY = container ? container.getBoundingClientRect().top : 48;
    const absX = data.rect.x + offsetX;
    const absY = data.rect.y + offsetY;
    // Show quick regenerate popup (primary action) instead of annotation editor
    setQuickRegen({
      bridgeId: data.bridgeId,
      tagName: data.tagName,
      rect: { x: absX, y: absY },
      instruction: '',
      loading: false,
      error: null,
      showAnnotationForm: false,
    });
    // Keep editingAnnotation available for annotation-only flow
    setEditingAnnotation({
      ...data,
      rect: { ...data.rect, x: absX, y: absY },
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape: close any open popup
      if (e.key === 'Escape') {
        if (quickRegen) { setQuickRegen(null); setEditingAnnotation(null); }
        if (showVersionHistory) setShowVersionHistory(false);
      }
      // A: toggle annotation mode (when not typing in an input)
      if (e.key === 'a' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const active = document.activeElement;
        const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable);
        if (!isTyping && html) {
          setAnnotationMode(prev => !prev);
        }
      }
      // F: toggle focus mode (when not typing in an input)
      if (e.key === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const active = document.activeElement;
        const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable);
        if (!isTyping) {
          setFocusMode(prev => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [quickRegen, showVersionHistory, html]);

  const handleQuickRegen = useCallback(async () => {
    if (!quickRegen || !id || !quickRegen.instruction.trim()) return;
    setQuickRegen(prev => prev ? { ...prev, loading: true, error: null } : null);

    try {
      const response = await fetch(`/api/projects/${id}/prototype/regenerate-component`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bridgeId: quickRegen.bridgeId, instruction: quickRegen.instruction }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Failed' }));
        setQuickRegen(prev => prev ? { ...prev, loading: false, error: err.error || 'Failed' } : null);
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.done && evt.html) {
              // Swap in iframe
              const iframe = document.querySelector('iframe');
              if (iframe?.contentWindow) {
                iframe.contentWindow.postMessage({ type: 'swap-component', bridgeId: evt.bridgeId, html: evt.html }, '*');
              }
              // Refresh full HTML from server
              const projRes = await fetch(`/api/projects/${id}`);
              if (projRes.ok) {
                const proj = await projRes.json();
                setHtml(proj.currentHtml);
              }
              setQuickRegen(null);
              setEditingAnnotation(null);
              setToastMsg('✓ 元件已更新');
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err: any) {
      setQuickRegen(prev => prev ? { ...prev, loading: false, error: err.message || 'Failed' } : null);
    }
  }, [quickRegen, id]);

  const handleStartRename = () => {
    setNameValue(project?.name ?? '');
    setEditingName(true);
  };

  const handleSaveName = async () => {
    if (!nameValue.trim() || nameValue === project?.name) {
      setEditingName(false);
      return;
    }
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameValue.trim() }),
      });
      if (res.ok) {
        setProject(prev => prev ? { ...prev, name: nameValue.trim() } : null);
        setToastMsg('已重新命名');
      }
    } catch { /* ignore */ }
    setEditingName(false);
  };

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
      <div style={{ ...styles.toolbar, ...(focusMode ? { display: 'none' } : {}) }}>
        <div style={styles.toolbarLeft}>
          <button style={styles.homeBtn} onClick={() => navigate('/')} title="Home" data-testid="home-btn">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 8l6-6 6 6M4 7v6h3v-3h2v3h3V7" />
            </svg>
          </button>
          {editingName ? (
            <input
              autoFocus
              title="專案名稱"
              placeholder="專案名稱"
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
              style={styles.projectNameInput}
            />
          ) : (
            <span style={styles.projectName} onClick={handleStartRename} title="點擊重新命名">
              {project.name}
            </span>
          )}
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
            type="button"
            style={{ ...styles.historyBtn, ...(showTokens ? styles.annotateBtnActive : {}), ...(!html ? { opacity: 0.5 } : {}) }}
            onClick={() => {
              if (showTokens) { setShowTokens(false); } else { handleOpenTokens(); }
            }}
            title="Design Tokens"
            disabled={!html}
            data-testid="tokens-btn"
          >
            🎨 Tokens
          </button>
          <button
            type="button"
            style={styles.historyBtn}
            onClick={() => setShowVersionHistory(true)}
            title="版本歷史"
            disabled={!html}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
              <circle cx="7" cy="7" r="5.5"/>
              <polyline points="7,4 7,7 9,8.5"/>
            </svg>
            History
          </button>
          <div style={styles.deviceFrameGroup}>
            <button
              type="button"
              style={{ ...styles.deviceFrameBtn, ...(deviceFrame === 'desktop' ? styles.deviceFrameBtnActive : {}) }}
              onClick={() => setDeviceFrame('desktop')}
              title="Desktop"
              data-testid="device-frame-desktop"
            >🖥</button>
            <button
              type="button"
              style={{ ...styles.deviceFrameBtn, ...(deviceFrame === 'mobile' ? styles.deviceFrameBtnActive : {}) }}
              onClick={() => setDeviceFrame('mobile')}
              title="Mobile"
              data-testid="device-frame-mobile"
            >📱</button>
            <button
              type="button"
              style={{ ...styles.deviceFrameBtn, ...(deviceFrame === 'tablet' ? styles.deviceFrameBtnActive : {}) }}
              onClick={() => setDeviceFrame('tablet')}
              title="Tablet"
              data-testid="device-frame-tablet"
            >📟</button>
          </div>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
              type="button"
              style={{ ...styles.historyBtn, ...(html ? {} : { opacity: 0.5 }) }}
              onClick={() => setShowExportMenu(v => !v)}
              disabled={!html}
              title="匯出選項"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
                <path d="M7 1v8M4 6l3 3 3-3M2 11h10"/>
              </svg>
              Export
            </button>
            {showExportMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 4,
                  background: '#1e1e2e',
                  border: '1px solid #3a3a4a',
                  borderRadius: 6,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                  zIndex: 1000,
                  minWidth: 170,
                  overflow: 'hidden',
                }}
                onMouseLeave={() => setShowExportMenu(false)}
              >
                <button
                  type="button"
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 14px',
                    background: 'none',
                    border: 'none',
                    color: '#e0e0f0',
                    fontSize: 13,
                    textAlign: 'left',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#2a2a3e')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  onClick={() => { handleExport(); setShowExportMenu(false); }}
                >
                  📥 下載 HTML
                </button>
                <button
                  type="button"
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 14px',
                    background: 'none',
                    border: 'none',
                    color: '#e0e0f0',
                    fontSize: 13,
                    textAlign: 'left',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#2a2a3e')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  onClick={() => { handleOpenInNewTab(); setShowExportMenu(false); }}
                >
                  🔗 在新分頁開啟
                </button>
              </div>
            )}
          </div>
          <button
            style={{
              ...styles.annotateBtn,
              ...(annotationMode ? styles.annotateBtnActive : {}),
            }}
            onClick={() => setAnnotationMode(!annotationMode)}
            title={annotationMode ? 'Disable annotation mode (A)' : 'Enable annotation mode (A)'}
            data-testid="annotate-toggle"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M10.5 1.5l2 2L4 12H2v-2L10.5 1.5z" />
            </svg>
            Annotate
          </button>
          <button
            type="button"
            style={styles.historyBtn}
            onClick={() => setFocusMode(true)}
            title="專注模式 (F)"
            data-testid="focus-mode-btn"
          >
            ⛶ 專注
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

      {/* Annotation mode banner */}
      {annotationMode && (
        <div style={styles.annotationBanner}>
          ✏️ 標注模式 — 點擊元件來修改或標注 · 按 <kbd style={styles.kbd}>A</kbd> 或 <kbd style={styles.kbd}>Esc</kbd> 退出
        </div>
      )}

      {/* Main content */}
      <div style={styles.body}>
        <div style={{ ...styles.chatPane, ...(focusMode ? { width: 0, overflow: 'hidden', borderRight: 'none' } : {}) }}>
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
            <button
              style={{ ...styles.tabBtn, ...(leftTab === 'style' ? styles.tabBtnActive : {}), ...(!html ? styles.tabBtnDisabled : {}) }}
              onClick={() => html && setLeftTab('style')}
              disabled={!html}
              data-testid="tab-style"
              title={!html ? '請先生成原型' : undefined}
            >
              🎨 樣式
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
            ) : leftTab === 'design' ? (
              <DesignPanel
                projectId={project.id}
                onSaved={checkDesignActive}
              />
            ) : (
              <StyleTweakerPanel
                html={html}
                onInject={injectStyles}
                onSave={handleSaveStyles}
              />
            )}
          </div>
        </div>
        <div style={styles.previewPane} ref={iframeContainerRef}>
          {isMultiPage && pages.length > 1 && (
            <div style={styles.pageSidebar}>
              <div style={styles.pageSidebarLabel}>Pages</div>
              {pages.map(page => (
                <button
                  key={page}
                  type="button"
                  style={{
                    ...styles.pageSidebarItem,
                    ...(activePage === page ? styles.pageSidebarItemActive : {}),
                  }}
                  onClick={() => handleNavigatePage(page)}
                  data-testid={`page-tab-${page}`}
                >
                  {page}
                </button>
              ))}
            </div>
          )}
          <div style={deviceFrame === 'desktop' ? styles.previewScrollDesktop : styles.previewScroll}>
            <div style={
              deviceFrame === 'mobile'
                ? styles.deviceFrameMobile
                : deviceFrame === 'tablet'
                  ? styles.deviceFrameTablet
                  : styles.deviceFrameDesktop
            }>
              <PreviewPanel
                html={html}
                deviceSize={deviceSize}
                annotationMode={annotationMode}
                onElementClick={handleElementClick}
                onIndicatorClick={handleIndicatorClick}
                annotations={annotationIndicators}
              />
            </div>
          </div>
        </div>
        {!focusMode && (
          <SpecPanel
            annotations={annotations}
            selectedAnnotation={selectedAnnotation}
            onSelectAnnotation={setSelectedAnnotation}
            onHighlightElement={handleHighlightElement}
            onSaveSpec={handleSaveSpec}
            collapsed={specPanelCollapsed}
            onToggle={() => setSpecPanelCollapsed(!specPanelCollapsed)}
            savingSpec={savingSpec}
            projectId={project.id}
          />
        )}
      </div>

      {/* Focus mode floating exit button */}
      {focusMode && (
        <button
          type="button"
          style={styles.focusModeExitBtn}
          onClick={() => setFocusMode(false)}
          title="退出專注模式 (F)"
          data-testid="focus-mode-exit-btn"
        >
          ⛶ 退出專注
        </button>
      )}

      {/* Quick Regenerate popup — primary action when clicking element in annotation mode */}
      {quickRegen && !quickRegen.showAnnotationForm && (
        <div style={{
          ...styles.quickRegenPopup,
          left: Math.min(quickRegen.rect.x, window.innerWidth - 320),
          top: Math.min(quickRegen.rect.y + 8, window.innerHeight - 200),
        }}>
          <div style={styles.quickRegenHeader}>
            <span style={styles.quickRegenTitle}>
              ⟳ 修改元件 · <code style={styles.quickRegenTag}>{quickRegen.tagName.toLowerCase()}</code>
              {editingAnnotation?.textContent && (
                <span style={styles.quickRegenTextPreview}>
                  {editingAnnotation.textContent.trim().slice(0, 30)}{editingAnnotation.textContent.trim().length > 30 ? '…' : ''}
                </span>
              )}
            </span>
            <button type="button" onClick={() => { setQuickRegen(null); setEditingAnnotation(null); }}
              style={styles.quickRegenClose}>×</button>
          </div>
          {regenHistory.length > 0 && (
            <div style={styles.regenHistoryChips}>
              {regenHistory.slice(0, 3).map((p, i) => (
                <button
                  key={i}
                  type="button"
                  style={styles.regenHistoryChip}
                  onClick={() => setQuickRegen(prev => prev ? { ...prev, instruction: p } : null)}
                  title={p}
                >
                  {p.length > 30 ? p.slice(0, 30) + '…' : p}
                </button>
              ))}
            </div>
          )}
          <textarea
            autoFocus
            placeholder="描述要怎麼修改這個元件..."
            value={quickRegen.instruction}
            onChange={e => setQuickRegen(prev => prev ? { ...prev, instruction: e.target.value } : null)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleQuickRegen(); }}
            style={styles.quickRegenTextarea}
          />
          {quickRegen.error && <div style={styles.quickRegenError}>{quickRegen.error}</div>}
          <div style={styles.quickRegenActions}>
            <button
              type="button"
              onClick={handleQuickRegen}
              disabled={quickRegen.loading || !quickRegen.instruction.trim()}
              style={{ ...styles.quickRegenSubmit, background: quickRegen.loading ? '#94a3b8' : '#3b82f6' }}
            >
              {quickRegen.loading ? '⟳ 生成中...' : '⚡ 修改'}
            </button>
            <button
              type="button"
              onClick={() => setQuickRegen(prev => prev ? { ...prev, showAnnotationForm: true } : null)}
              style={styles.quickRegenAnnotateBtn}
              title="改成建立標注"
            >
              + 標注
            </button>
          </div>
          {hasDesignSpec && (
            <div style={styles.quickRegenSpecIndicator} data-testid="design-spec-indicator">
              Using design spec
            </div>
          )}
          <div style={styles.quickRegenHint}>⌘Enter 送出</div>
        </div>
      )}

      {/* Annotation editor popup — secondary action */}
      {editingAnnotation && quickRegen?.showAnnotationForm && (
        <AnnotationEditor
          elementLabel={`<${editingAnnotation.tagName.toLowerCase()}> ${editingAnnotation.textContent}`}
          position={{ x: editingAnnotation.rect.x, y: editingAnnotation.rect.y }}
          onSave={handleSaveAnnotation}
          onCancel={() => { setEditingAnnotation(null); setQuickRegen(null); }}
        />
      )}

      {showTokens && (
        <TokenPanel
          tokens={tokens}
          loading={tokensLoading}
          onClose={() => setShowTokens(false)}
        />
      )}

      {showVersionHistory && project && (
        <VersionHistoryPanel
          projectId={project.id}
          currentVersion={project.currentVersion}
          onRestore={(html, version, isMultiPage, pages) => {
            setHtml(html);
            setIsMultiPage(isMultiPage);
            setPages(pages);
            setProject(prev => prev ? { ...prev, currentVersion: version } : null);
          }}
          onClose={() => setShowVersionHistory(false)}
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
    cursor: 'pointer',
    textDecoration: 'underline dotted',
  },
  projectNameInput: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#1e293b',
    border: '1px solid #3b82f6',
    borderRadius: '4px',
    padding: '2px 6px',
    outline: 'none',
    width: '200px',
  },
  historyBtn: {
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
  tabBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
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
    flexDirection: 'row',
  },
  pageSidebar: {
    width: '120px',
    flexShrink: 0,
    borderRight: '1px solid #e2e8f0',
    backgroundColor: '#ffffff',
    display: 'flex',
    flexDirection: 'column' as const,
    overflowY: 'auto' as const,
    padding: '8px 6px',
    gap: '4px',
  },
  pageSidebarLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    padding: '2px 6px 6px',
    flexShrink: 0,
  },
  pageSidebarItem: {
    display: 'block',
    width: '100%',
    padding: '6px 8px',
    border: '1px solid transparent',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: '#475569',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    textAlign: 'left' as const,
    wordBreak: 'break-word' as const,
    flexShrink: 0,
  },
  pageSidebarItemActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    color: '#1d4ed8',
  },
  quickRegenPopup: {
    position: 'fixed' as const,
    zIndex: 10000,
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
    padding: '12px',
    width: '300px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  quickRegenHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  quickRegenTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#475569',
  },
  quickRegenTag: {
    fontSize: '11px',
    background: '#f1f5f9',
    padding: '1px 4px',
    borderRadius: '3px',
  },
  quickRegenClose: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#94a3b8',
    fontSize: '16px',
    lineHeight: 1,
  },
  quickRegenTextarea: {
    width: '100%',
    boxSizing: 'border-box' as const,
    resize: 'none' as const,
    height: '72px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '8px',
    fontSize: '13px',
    color: '#1e293b',
    outline: 'none',
    fontFamily: 'inherit',
  },
  quickRegenError: {
    fontSize: '12px',
    color: '#ef4444',
    marginTop: '4px',
  },
  quickRegenActions: {
    display: 'flex',
    gap: '6px',
    marginTop: '8px',
  },
  quickRegenSubmit: {
    flex: 1,
    padding: '7px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
  },
  quickRegenAnnotateBtn: {
    padding: '7px 10px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    background: '#fff',
    color: '#64748b',
    cursor: 'pointer',
    fontSize: '12px',
  },
  quickRegenSpecIndicator: {
    fontSize: '11px',
    color: '#0369a1',
    backgroundColor: '#e0f2fe',
    borderRadius: '6px',
    padding: '3px 8px',
    marginTop: '6px',
    display: 'inline-block',
  },
  quickRegenHint: {
    fontSize: '11px',
    color: '#94a3b8',
    marginTop: '6px',
    textAlign: 'center' as const,
  },
  quickRegenTextPreview: {
    display: 'block',
    fontSize: '11px',
    color: '#94a3b8',
    fontWeight: 400,
    marginTop: '2px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  annotationBanner: {
    background: '#eff6ff',
    borderBottom: '1px solid #bfdbfe',
    padding: '6px 16px',
    fontSize: '12px',
    color: '#1d4ed8',
    textAlign: 'center' as const,
  },
  kbd: {
    background: '#dbeafe',
    border: '1px solid #93c5fd',
    borderRadius: '3px',
    padding: '1px 5px',
    fontSize: '11px',
    fontFamily: 'monospace',
  },
  deviceFrameGroup: {
    display: 'flex',
    alignItems: 'center',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  deviceFrameBtn: {
    padding: '5px 9px',
    border: 'none',
    backgroundColor: '#ffffff',
    color: '#475569',
    fontSize: '13px',
    cursor: 'pointer',
    lineHeight: 1,
  },
  deviceFrameBtnActive: {
    backgroundColor: '#eff6ff',
    color: '#3b82f6',
  },
  previewScroll: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '16px',
    backgroundColor: '#f1f5f9',
    boxSizing: 'border-box' as const,
  },
  previewScrollDesktop: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  deviceFrameDesktop: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  deviceFrameMobile: {
    width: '375px',
    height: '812px',
    flexShrink: 0,
    margin: '0 auto',
    border: '2px solid #333',
    borderRadius: '40px',
    overflow: 'hidden',
  },
  deviceFrameTablet: {
    width: '768px',
    height: '1024px',
    flexShrink: 0,
    margin: '0 auto',
    border: '2px solid #333',
    borderRadius: '40px',
    overflow: 'hidden',
  },
  regenHistoryChips: {
    display: 'flex',
    flexWrap: 'nowrap' as const,
    overflowX: 'auto' as const,
    gap: '4px',
    marginBottom: '6px',
    scrollbarWidth: 'none' as const,
  },
  focusModeExitBtn: {
    position: 'fixed' as const,
    bottom: '16px',
    right: '16px',
    zIndex: 10001,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    backdropFilter: 'blur(4px)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
  },
  regenHistoryChip: {
    flexShrink: 0,
    padding: '3px 8px',
    backgroundColor: '#f1f5f9',
    border: '1px solid #e2e8f0',
    borderRadius: '999px',
    fontSize: '12px',
    color: '#475569',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    maxWidth: '200px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
};
