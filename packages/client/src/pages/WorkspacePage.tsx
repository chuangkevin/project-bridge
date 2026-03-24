import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ChatPanel, { ChatMessage } from '../components/ChatPanel';
import DesignPanel from '../components/DesignPanel';
import StyleTweakerPanel from '../components/StyleTweakerPanel';
import PreviewPanel, { InteractionMode } from '../components/PreviewPanel';
import DeviceSizeSelector, { DeviceSize } from '../components/DeviceSizeSelector';
import Toast from '../components/Toast';
import AnnotationEditor from '../components/AnnotationEditor';
import SpecPanel, { Annotation } from '../components/SpecPanel';
import VersionHistoryPanel from '../components/VersionHistoryPanel';
import TokenPanel, { DesignToken } from '../components/TokenPanel';
import ApiBindingPanel from '../components/ApiBindingPanel';
import PageApiBindingPanel from '../components/PageApiBindingPanel';
import ConstraintPanel from '../components/ConstraintPanel';
import VisualEditor from '../components/VisualEditor';
import CodePanel from '../components/CodePanel';
import CodeFileTree from '../components/CodeFileTree';
import { SpecData } from '../components/SpecForm';
import { useArchStore } from '../stores/useArchStore';
import ArchitectureTab from '../components/ArchitectureTab';
import FigmaExportDialog from '../components/FigmaExportDialog';

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
  arch_data?: any;
  mode?: 'architecture' | 'design';
  owner_id?: string;
  owner_name?: string;
}

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [html, setHtml] = useState<string | null>(null);
  const [deviceSize, setDeviceSize] = useState<DeviceSize>('desktop');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<'chat' | 'design' | 'style'>('chat');
  const [activeMode, setActiveMode] = useState<'design' | 'architecture'>('design');
  const [pendingChatMessage, setPendingChatMessage] = useState<string | null>(null);
  const { setArchData, targetPage, setTargetPage } = useArchStore();
  const [designActive, setDesignActive] = useState(false);
  const [isMultiPage, setIsMultiPage] = useState(false);
  const [pages, setPages] = useState<string[]>([]);
  const [activePage, setActivePage] = useState<string>('');
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');

  const [showVersionHistory, setShowVersionHistory] = useState(false);

  // Token panel state
  const [showTokens, setShowTokens] = useState(false);
  const [tokens, setTokens] = useState<DesignToken[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);

  // Interaction mode state (browse, annotate, api-binding)
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('browse');

  // Annotation state
  const [annotationMode, setAnnotationMode] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  // API binding state
  const [apiBindingElement, setApiBindingElement] = useState<{
    bridgeId: string;
    tagName: string;
  } | null>(null);
  const [apiBindingIndicators, setApiBindingIndicators] = useState<{ bridgeId: string }[]>([]);
  const [apiBindingsFull, setApiBindingsFull] = useState<{ id: string; bridgeId: string; method: string; url: string }[]>([]);
  const [showConstraintPanel, setShowConstraintPanel] = useState(false);
  const [showPageApiPanel, setShowPageApiPanel] = useState(false);
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

  // Export dropdown state
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportingFramework, setExportingFramework] = useState<string | null>(null);
  const [showFigmaExport, setShowFigmaExport] = useState(false);

  // Share panel state
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [shareEnabled, setShareEnabled] = useState(true);
  const [copyLinkFeedback, setCopyLinkFeedback] = useState(false);

  // Whether this project has uploaded files with visual analysis (design spec)
  const [hasDesignSpec, setHasDesignSpec] = useState(false);

  // Focus mode state
  const [focusMode, setFocusMode] = useState(false);
  const [chatPaneWidth, setChatPaneWidth] = useState(() => {
    const saved = localStorage.getItem('pb-chat-pane-width');
    return saved ? parseInt(saved, 10) : 350;
  });
  const chatResizing = useRef(false);

  // Keyboard shortcuts help overlay state
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Onboarding tour state: null = no tour, 0-3 = step index
  const [onboardingStep, setOnboardingStep] = useState<number | null>(null);
  const prevHtmlRef = useRef<string | null | undefined>(undefined);

  // Inline rename state
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');

  // Fork state
  const [forking, setForking] = useState(false);

  // Read-only when viewing another user's project (non-admin)
  const isReadOnly = !!(project && user && project.owner_id && project.owner_id !== user.id && user.role !== 'admin');

  const handleFork = useCallback(async () => {
    if (!project || forking) return;
    setForking(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/fork`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Fork 失敗' }));
        setToastMsg(data.error || 'Fork 失敗');
        return;
      }
      const data = await res.json();
      navigate(`/projects/${data.id}`);
    } catch {
      setToastMsg('Fork 失敗');
    } finally {
      setForking(false);
    }
  }, [project, forking, navigate]);

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
      // Always reset arch store to this project's data (prevents bleed from previous project)
      setArchData(projData.arch_data ?? null);
      if (!projData.arch_data && !projData.currentHtml) {
        // Brand new project: respect the mode chosen at creation time
        setActiveMode(projData.mode === 'design' ? 'design' : 'architecture');
      } else if (projData.currentHtml) {
        setActiveMode('design'); // has prototype → go to design
      }

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

  // Watch targetPage from arch store — switch to design mode and navigate to the page
  useEffect(() => {
    if (!targetPage) return;
    setActiveMode('design');
    window.postMessage({ type: 'show-page', name: targetPage }, '*');
    setTargetPage(null);
  }, [targetPage]);

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

    // Validate navigation for multi-page prototypes
    if (data.isMultiPage && id) {
      fetch(`/api/projects/${id}/prototype/validate-navigation`)
        .then(r => r.json())
        .then(result => {
          if (result.issues && result.issues.length > 0) {
            const errors = result.issues.filter((i: any) => i.severity === 'error').length;
            const warnings = result.issues.filter((i: any) => i.severity === 'warning').length;
            const parts: string[] = [];
            if (errors > 0) parts.push(`${errors} error(s)`);
            if (warnings > 0) parts.push(`${warnings} warning(s)`);
            setToastMsg(`Navigation: ${parts.join(', ')} — ${result.issues.map((i: any) => i.message).join('; ')}`);
          }
        })
        .catch(() => { /* navigation validation is non-blocking */ });
    }
  }, [id]);

  const handleNavigatePage = useCallback((page: string) => {
    setActivePage(page);
    window.postMessage({ type: 'show-page', name: page }, '*');
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

  const handleExportFramework = useCallback(async (framework: string) => {
    if (!project || !html) return;
    setExportingFramework(framework);
    setShowExportMenu(false);
    try {
      const res = await fetch(`/api/projects/${id}/export-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ framework }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: '匯出失敗' }));
        throw new Error(data.error || '匯出失敗');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers.get('Content-Disposition');
      const filenameMatch = disposition?.match(/filename="([^"]+)"/);
      a.download = filenameMatch ? filenameMatch[1] : `${project.name}-${framework}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setToastMsg(`已匯出 ${framework} 專案`);
    } catch (err: any) {
      setToastMsg(err.message || '匯出失敗');
    } finally {
      setExportingFramework(null);
    }
  }, [project, html, id]);

  const handleOpenInNewTab = useCallback(() => {
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    // Revoke after a short delay to allow the browser to load the page
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, [html]);

  const handleShare = useCallback(() => {
    if (!project?.share_token) return;
    if (shareEnabled) {
      setShowSharePanel(v => !v);
    } else {
      // Re-enable sharing and show panel
      setShareEnabled(true);
      setShowSharePanel(true);
    }
  }, [project, shareEnabled]);

  const handleCopyShareLink = useCallback(async () => {
    if (!project?.share_token) return;
    const url = `${window.location.origin}/share/${project.share_token}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopyLinkFeedback(true);
    setTimeout(() => setCopyLinkFeedback(false), 1800);
  }, [project]);

  const handleStopSharing = useCallback(() => {
    setShareEnabled(false);
    setShowSharePanel(false);
    setToastMsg('已停止分享');
  }, []);

  // Fetch API binding indicators
  const fetchApiBindingIndicators = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/projects/${id}/api-bindings`);
      if (res.ok) {
        const bindings = await res.json();
        setApiBindingIndicators(bindings.map((b: any) => ({ bridgeId: b.bridgeId })));
        setApiBindingsFull(bindings.map((b: any) => ({ id: b.id, bridgeId: b.bridgeId, method: b.method, url: b.url })));
      }
    } catch { /* silently fail */ }
  }, [id]);

  // Annotation handlers
  const handleElementClick = useCallback((data: {
    bridgeId: string;
    tagName: string;
    textContent: string;
    rect: { x: number; y: number; width: number; height: number };
  }) => {
    // In API binding mode, open the binding panel instead
    if (interactionMode === 'api-binding') {
      setApiBindingElement({ bridgeId: data.bridgeId, tagName: data.tagName });
      // Show constraint panel for form elements
      const formTags = ['INPUT', 'SELECT', 'TEXTAREA'];
      setShowConstraintPanel(formTags.includes(data.tagName.toUpperCase()));
      return;
    }

    const container = iframeContainerRef.current;
    const offsetX = container ? container.getBoundingClientRect().left : 300;
    const offsetY = container ? container.getBoundingClientRect().top : 48;
    const absX = data.rect.x + offsetX;
    const absY = data.rect.y + offsetY;

    // In annotation mode: skip QuickRegen popup, go straight to annotation editor
    if (interactionMode === 'annotate') {
      setEditingAnnotation({
        ...data,
        rect: { ...data.rect, x: absX, y: absY },
      });
      return;
    }

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
  }, [interactionMode]);

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
        if (showShortcuts) setShowShortcuts(false);
      }
      // A: toggle annotation mode (when not typing in an input)
      if (e.key === 'a' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const active = document.activeElement;
        const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable);
        if (!isTyping && html) {
          setAnnotationMode(prev => {
            const next = !prev;
            setInteractionMode(next ? 'annotate' : 'browse');
            return next;
          });
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
      // ?: toggle shortcuts help overlay (when not typing in an input)
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const active = document.activeElement;
        const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable);
        if (!isTyping) {
          setShowShortcuts(prev => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [quickRegen, showVersionHistory, showShortcuts, html]);

  // Onboarding: start tour for first-time users when there is no prototype yet
  useEffect(() => {
    if (!html && localStorage.getItem('pb-onboarded') === null) {
      const timer = setTimeout(() => setOnboardingStep(0), 500);
      return () => clearTimeout(timer);
    }
  }, [html]);

  // Onboarding: when html transitions from null to non-null, mark as onboarded
  useEffect(() => {
    if (prevHtmlRef.current === undefined) {
      // first render — just record value
      prevHtmlRef.current = html;
      return;
    }
    if (prevHtmlRef.current === null && html !== null) {
      localStorage.setItem('pb-onboarded', '1');
      setOnboardingStep(null);
    }
    prevHtmlRef.current = html;
  }, [html]);

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
        <p style={styles.loadingText}>載入專案中...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div style={styles.errorContainer}>
        <h2 style={styles.errorTitle}>{error || '找不到專案'}</h2>
        <button style={styles.backBtn} onClick={() => navigate('/')}>返回首頁</button>
      </div>
    );
  }

  const workspaceContainerStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden'
  };
  const tabBarStyle: React.CSSProperties = {
    display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#fff', padding: '0 16px', flexShrink: 0
  };
  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 20px', cursor: 'pointer',
    fontWeight: active ? 600 : 400,
    color: active ? '#8E6FA7' : '#666666',
    background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: active ? '2px solid #8E6FA7' : '2px solid transparent',
    fontSize: 14, transition: 'all 0.15s'
  });

  return (
    <div style={workspaceContainerStyle}>
      <div style={{ ...tabBarStyle, alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => navigate('/')}
          style={{ background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', cursor: 'pointer', padding: '6px 12px', color: '#666', display: 'flex', alignItems: 'center', gap: 4, marginRight: 8, fontSize: 13, flexShrink: 0 }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 12L6 8l4-4" />
          </svg>
          專案列表
        </button>
        <span style={{ color: '#e5e7eb', marginRight: 8, fontSize: 16 }}>|</span>
        <div role="tablist" style={{ display: 'flex' }}>
          <button
            type="button"
            role="tab"
            aria-selected={activeMode === 'design'}
            style={tabBtnStyle(activeMode === 'design')}
            onClick={() => setActiveMode('design')}
          >
            設計
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeMode === 'architecture'}
            style={tabBtnStyle(activeMode === 'architecture')}
            onClick={() => setActiveMode('architecture')}
          >
            架構圖
          </button>
        </div>
      </div>

      {activeMode === 'architecture' ? (
        <ArchitectureTab
          projectId={id!}
          onSwitchToDesign={() => setActiveMode('design')}
          onSwitchToDesignAndGenerate={() => {
            setActiveMode('design');
            setPendingChatMessage('請依照架構生成所有頁面');
          }}
        />
      ) : (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <div style={styles.container}>
      {/* Toolbar */}
      <div style={{ ...styles.toolbar, ...(focusMode ? { display: 'none' } : {}) }}>
        <div style={styles.toolbarLeft}>
          <button style={styles.homeBtn} onClick={() => navigate('/')} title="首頁" data-testid="home-btn">
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
          <div style={styles.viewModeToggle}>
            <button
              type="button"
              style={viewMode === 'preview' ? styles.viewModeBtnActive : styles.viewModeBtn}
              onClick={() => setViewMode('preview')}
              data-testid="view-mode-preview"
            >
              👁 Preview
            </button>
            <button
              type="button"
              style={viewMode === 'code' ? styles.viewModeBtnActive : styles.viewModeBtn}
              onClick={() => setViewMode('code')}
              data-testid="view-mode-code"
            >
              {'</>'} Code
            </button>
          </div>
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
            歷史版本
          </button>
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
              匯出
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
                  minWidth: 210,
                  overflow: 'hidden',
                }}
                onMouseLeave={() => { if (!exportingFramework) setShowExportMenu(false); }}
              >
                <div style={{ padding: '6px 14px', fontSize: 11, color: '#888', borderBottom: '1px solid #3a3a4a', textTransform: 'uppercase', letterSpacing: 1 }}>
                  匯出為框架專案
                </div>
                {([
                  { key: 'react', label: 'React', icon: '\u269B\uFE0F' },
                  { key: 'vue3', label: 'Vue 3', icon: '\uD83D\uDFE2' },
                  { key: 'nextjs', label: 'Next.js', icon: '\u25B2' },
                  { key: 'nuxt3', label: 'Nuxt 3', icon: '\uD83D\uDFE9' },
                ] as const).map(fw => (
                  <button
                    key={fw.key}
                    type="button"
                    disabled={!!exportingFramework}
                    data-testid={`export-${fw.key}`}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '8px 14px',
                      background: 'none',
                      border: 'none',
                      color: exportingFramework === fw.key ? '#a78bfa' : '#e0e0f0',
                      fontSize: 13,
                      textAlign: 'left',
                      cursor: exportingFramework ? 'wait' : 'pointer',
                      whiteSpace: 'nowrap',
                      opacity: exportingFramework && exportingFramework !== fw.key ? 0.5 : 1,
                    }}
                    onMouseEnter={e => { if (!exportingFramework) e.currentTarget.style.background = '#2a2a3e'; }}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    onClick={() => handleExportFramework(fw.key)}
                  >
                    {exportingFramework === fw.key ? '\u23F3' : fw.icon} {fw.label}
                    {exportingFramework === fw.key && ' 匯出中...'}
                  </button>
                ))}
                <div style={{ borderTop: '1px solid #3a3a4a', marginTop: 2 }} />
                <button
                  type="button"
                  disabled={!!exportingFramework}
                  data-testid="export-html"
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 14px',
                    background: 'none',
                    border: 'none',
                    color: exportingFramework === 'html' ? '#a78bfa' : '#e0e0f0',
                    fontSize: 13,
                    textAlign: 'left',
                    cursor: exportingFramework ? 'wait' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => { if (!exportingFramework) e.currentTarget.style.background = '#2a2a3e'; }}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  onClick={() => handleExportFramework('html')}
                >
                  {exportingFramework === 'html' ? '\u23F3 匯出中...' : '\uD83D\uDCC4 匯出 HTML 專案'}
                </button>
                <div style={{ borderTop: '1px solid #3a3a4a' }} />
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
                  📥 下載原始 HTML
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
                  onClick={async () => {
                    setShowExportMenu(false);
                    try {
                      const res = await fetch(`/api/projects/${id}/api-bindings/export`);
                      if (res.ok) {
                        const data = await res.json();
                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${project!.name.replace(/[^a-z0-9\u4e00-\u9fff]/gi, '-')}-api-bindings.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      } else {
                        setToastMsg('匯出失敗');
                      }
                    } catch { setToastMsg('匯出失敗'); }
                  }}
                  data-testid="export-api-bindings"
                >
                  📋 API Bindings (JSON)
                </button>
                <div style={{ borderTop: '1px solid #3a3a4a' }} />
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
                  onClick={() => { setShowFigmaExport(true); setShowExportMenu(false); }}
                  data-testid="export-figma"
                >
                  Figma ↗ 匯出到 Figma
                </button>
              </div>
            )}
          </div>
          <button
            style={{
              ...styles.annotateBtn,
              ...(annotationMode ? styles.annotateBtnActive : {}),
            }}
            onClick={() => {
              const next = !annotationMode;
              setAnnotationMode(next);
              setInteractionMode(next ? 'annotate' : 'browse');
              if (next) { setApiBindingElement(null); setShowConstraintPanel(false); }
            }}
            title={annotationMode ? 'Disable annotation mode (A)' : 'Enable annotation mode (A)'}
            data-testid="annotate-toggle"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M10.5 1.5l2 2L4 12H2v-2L10.5 1.5z" />
            </svg>
            標注
          </button>
          <button
            type="button"
            style={{
              ...styles.annotateBtn,
              ...(interactionMode === 'api-binding' ? { backgroundColor: '#eff6ff', borderColor: '#2563eb', color: '#2563eb' } : {}),
              ...(!html ? { opacity: 0.5 } : {}),
            }}
            onClick={() => {
              const isActive = interactionMode === 'api-binding';
              setInteractionMode(isActive ? 'browse' : 'api-binding');
              setAnnotationMode(false);
              if (!isActive) { fetchApiBindingIndicators(); }
              if (isActive) { setApiBindingElement(null); setShowConstraintPanel(false); }
            }}
            disabled={!html}
            title="API Binding mode"
            data-testid="api-binding-toggle"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M2 4h10M2 7h10M2 10h6" />
            </svg>
            API
          </button>
          <button
            type="button"
            style={{
              ...styles.annotateBtn,
              ...(interactionMode === 'visual-edit' ? { backgroundColor: '#faf5ff', borderColor: '#8E6FA7', color: '#8E6FA7' } : {}),
              ...(!html ? { opacity: 0.5 } : {}),
            }}
            onClick={() => {
              const isActive = interactionMode === 'visual-edit';
              setInteractionMode(isActive ? 'browse' : 'visual-edit');
              setAnnotationMode(false);
              if (isActive) { /* deactivate */ }
            }}
            disabled={!html}
            title="拖移編輯模式（點擊選取元件後可拖動位置）"
            data-testid="visual-edit-toggle"
          >
            ↔ 拖移
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
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
              style={{
                ...styles.shareBtn,
                ...(shareEnabled && showSharePanel
                  ? { backgroundColor: '#eff6ff', borderColor: '#3b82f6', color: '#2563eb' }
                  : {}),
              }}
              onClick={handleShare}
              data-testid="share-btn"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
                <circle cx="3" cy="7" r="2" />
                <circle cx="11" cy="3" r="2" />
                <circle cx="11" cy="11" r="2" />
                <line x1="4.8" y1="6" x2="9.2" y2="3.8" />
                <line x1="4.8" y1="8" x2="9.2" y2="10.2" />
              </svg>
              {shareEnabled ? '已分享' : 'Share'}
            </button>
            {showSharePanel && shareEnabled && project?.share_token && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  zIndex: 1100,
                  minWidth: '280px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
                onMouseLeave={() => setShowSharePanel(false)}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    overflow: 'hidden',
                  }}
                  title={`${window.location.origin}/share/${project.share_token}`}
                >
                  <span
                    style={{
                      flex: 1,
                      fontSize: '12px',
                      color: '#64748b',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {`${window.location.origin}/share/${project.share_token}`}
                  </span>
                </div>
                <button
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '7px',
                    backgroundColor: copyLinkFeedback ? '#f0fdf4' : '#f8fafc',
                    color: copyLinkFeedback ? '#16a34a' : '#374151',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onClick={handleCopyShareLink}
                  data-testid="copy-share-link-btn"
                >
                  {copyLinkFeedback ? '✓ 已複製!' : '📋 複製連結'}
                </button>
                <a
                  href={`${window.location.origin}/share/${project.share_token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '7px',
                    backgroundColor: '#f8fafc',
                    color: '#374151',
                    fontSize: '13px',
                    fontWeight: 500,
                    textDecoration: 'none',
                  }}
                  data-testid="open-share-link-btn"
                >
                  🔗 在新分頁開啟
                </a>
                <button
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 12px',
                    border: '1px solid #fecaca',
                    borderRadius: '7px',
                    backgroundColor: '#fff5f5',
                    color: '#dc2626',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                  onClick={handleStopSharing}
                  data-testid="stop-sharing-btn"
                >
                  停止分享
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            style={styles.shortcutsBtn}
            onClick={() => setShowShortcuts(v => !v)}
            title="鍵盤快捷鍵 (?)"
            data-testid="shortcuts-btn"
          >
            ⌨ ?
          </button>
          {isReadOnly && (
            <button
              type="button"
              style={styles.forkBtn}
              onClick={handleFork}
              disabled={forking}
              title="複製此專案到你的帳號"
              data-testid="fork-btn"
            >
              {forking ? '⟳ Fork 中...' : '⑂ Fork 專案'}
            </button>
          )}
          {user && (
            <div style={styles.userWidget}>
              <span
                style={styles.userWidgetName}
                data-testid="current-user-name"
                title={user.name}
              >
                {user.name}
              </span>
              <button
                type="button"
                style={styles.logoutBtn}
                onClick={logout}
                data-testid="logout-btn"
                title="登出"
              >
                登出
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Annotation mode banner */}
      {annotationMode && (
        <div style={styles.annotationBanner}>
          ✏️ 標注模式 — 點擊元件來修改或標注 · 按 <kbd style={styles.kbd}>A</kbd> 或 <kbd style={styles.kbd}>Esc</kbd> 退出
        </div>
      )}
      {/* API binding mode banner */}
      {interactionMode === 'api-binding' && (
        <div style={{ ...styles.annotationBanner, background: '#eff6ff', color: '#1e40af', borderBottom: '2px solid #2563eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>API Binding Mode — Click any element to define its API endpoint binding</span>
          <button
            type="button"
            onClick={() => setShowPageApiPanel(true)}
            style={{ background: '#8E6FA7', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
            data-testid="open-page-api-btn"
          >
            Page-level API
          </button>
        </div>
      )}

      {/* Main content */}
      <div style={styles.body}>
        <div style={styles.chatPaneWrapper}>
        {isReadOnly && <div style={styles.readOnlyOverlay} data-testid="readonly-overlay" />}
        <div style={{ ...styles.chatPane, width: focusMode ? 0 : chatPaneWidth, ...(focusMode ? { overflow: 'hidden', borderRight: 'none' } : {}) }}>
          {/* Tab switcher */}
          <div style={styles.tabBar}>
            <button
              style={{ ...styles.tabBtn, ...(leftTab === 'chat' ? styles.tabBtnActive : {}) }}
              onClick={() => setLeftTab('chat')}
              data-testid="tab-chat"
            >
              對話
            </button>
            <button
              style={{ ...styles.tabBtn, ...(leftTab === 'design' ? styles.tabBtnActive : {}) }}
              onClick={() => setLeftTab('design')}
              data-testid="tab-design"
            >
              設計
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
                pendingMessage={pendingChatMessage}
                onPendingMessageConsumed={() => setPendingChatMessage(null)}
                hasPrototype={!!html}
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
        </div>
        {/* Resize handle for chat pane */}
        {!focusMode && (
          <div
            style={{ width: 5, cursor: 'col-resize', background: 'transparent', flexShrink: 0, zIndex: 20, transition: 'background 0.15s' }}
            onMouseDown={(e) => {
              e.preventDefault();
              chatResizing.current = true;
              const startX = e.clientX;
              const startW = chatPaneWidth;
              const handle = e.currentTarget as HTMLDivElement;
              handle.style.background = 'var(--accent, #8E6FA7)';
              const onMove = (ev: MouseEvent) => {
                if (!chatResizing.current) return;
                const newW = Math.max(250, Math.min(700, startW + (ev.clientX - startX)));
                setChatPaneWidth(newW);
              };
              const onUp = () => {
                chatResizing.current = false;
                handle.style.background = 'transparent';
                localStorage.setItem('pb-chat-pane-width', String(chatPaneWidth));
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
              };
              document.addEventListener('mousemove', onMove);
              document.addEventListener('mouseup', onUp);
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--border-primary, #e2e8f0)'; }}
            onMouseLeave={(e) => { if (!chatResizing.current) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
          />
        )}
        <div style={styles.previewPane} ref={iframeContainerRef}>
          {viewMode === 'code' ? (
            /* Code view */
            !html ? (
              <div style={styles.emptyStateContainer}>
                <div style={{ ...styles.emptyStateCard, backgroundColor: '#1e1e2e', border: '2px dashed #45475a' }}>
                  <div style={styles.emptyStateIcon}>💻</div>
                  <div style={{ ...styles.emptyStateTitle, color: '#cdd6f4' }}>尚未生成原型，請先在對話中描述需求</div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                <CodeFileTree
                  pages={pages}
                  activePage={activePage || null}
                  onSelect={handleNavigatePage}
                />
                <CodePanel
                  html={html}
                  pages={pages}
                  activePage={activePage}
                  onPageChange={handleNavigatePage}
                />
              </div>
            )
          ) : (
            /* Preview view */
            <>
              {isMultiPage && pages.length > 1 && (
                <div style={styles.pageSidebar}>
                  <div style={styles.pageSidebarLabel}>頁面</div>
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
              <div style={deviceSize === 'desktop' ? styles.previewScrollDesktop : styles.previewScroll}>
                {!html ? (
                  <div style={styles.emptyStateContainer}>
                    <div style={styles.emptyStateCard}>
                      <div style={styles.emptyStateIcon}>🎨</div>
                      <div style={styles.emptyStateTitle}>尚未生成原型</div>
                      <div style={styles.emptyStateSubtitle}>
                        在左側聊天輸入你的需求，或上傳設計稿 PDF，AI 將生成互動式原型
                      </div>
                      <ul style={styles.emptyStateHints}>
                        <li>💡 描述你想要的頁面設計</li>
                        <li>📎 上傳設計稿 PDF 讓 AI 分析樣式</li>
                        <li>⚡ 點擊元素可以直接修改</li>
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div style={
                    deviceSize === 'mobile'
                      ? styles.deviceFrameMobile
                      : deviceSize === 'tablet'
                        ? styles.deviceFrameTablet
                        : styles.deviceFrameDesktop
                  }>
                    <PreviewPanel
                      html={html}
                      deviceSize={deviceSize}
                      annotationMode={annotationMode}
                      interactionMode={interactionMode}
                      onElementClick={handleElementClick}
                      onIndicatorClick={handleIndicatorClick}
                      annotations={annotationIndicators}
                      apiBindings={apiBindingIndicators}
                    />
                    {interactionMode === 'visual-edit' && id && (
                      <VisualEditor
                        projectId={id}
                        iframeRef={{ current: iframeContainerRef.current?.querySelector('iframe') as HTMLIFrameElement | null } as React.RefObject<HTMLIFrameElement>}
                        active={interactionMode === 'visual-edit'}
                      />
                    )}
                  </div>
                )}
              </div>
            </>
          )}
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
            apiBindings={apiBindingsFull}
            onSelectApiBinding={(bridgeId) => {
              setApiBindingElement({ bridgeId, tagName: 'element' });
              setInteractionMode('api-binding');
            }}
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

      {/* Annotation editor popup — direct in annotate mode, or secondary via quickRegen */}
      {editingAnnotation && (interactionMode === 'annotate' || quickRegen?.showAnnotationForm) && (
        <AnnotationEditor
          elementLabel={`<${editingAnnotation.tagName.toLowerCase()}> ${editingAnnotation.textContent}`}
          position={{ x: editingAnnotation.rect.x, y: editingAnnotation.rect.y }}
          onSave={handleSaveAnnotation}
          onCancel={() => { setEditingAnnotation(null); setQuickRegen(null); }}
        />
      )}

      {/* API Binding Panel */}
      {apiBindingElement && interactionMode === 'api-binding' && (
        <ApiBindingPanel
          projectId={project.id}
          bridgeId={apiBindingElement.bridgeId}
          tagName={apiBindingElement.tagName}
          onClose={() => { setApiBindingElement(null); setShowConstraintPanel(false); }}
          onSaved={fetchApiBindingIndicators}
        />
      )}

      {/* Page-level API Binding Panel */}
      {showPageApiPanel && interactionMode === 'api-binding' && (
        <PageApiBindingPanel
          projectId={project.id}
          activePage={activePage}
          pages={pages}
          onClose={() => setShowPageApiPanel(false)}
          onSaved={fetchApiBindingIndicators}
        />
      )}

      {/* Constraint Panel (shown alongside ApiBindingPanel for form elements) */}
      {apiBindingElement && showConstraintPanel && interactionMode === 'api-binding' && (
        <ConstraintPanel
          projectId={project.id}
          bridgeId={apiBindingElement.bridgeId}
          onClose={() => setShowConstraintPanel(false)}
        />
      )}

      {showTokens && (
        <TokenPanel
          tokens={tokens}
          loading={tokensLoading}
          onClose={() => setShowTokens(false)}
          projectId={id}
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

      {/* Keyboard shortcuts help overlay */}
      {showShortcuts && (
        <div
          style={styles.shortcutsBackdrop}
          onClick={() => setShowShortcuts(false)}
          data-testid="shortcuts-backdrop"
        >
          <div
            style={styles.shortcutsCard}
            onClick={e => e.stopPropagation()}
            data-testid="shortcuts-card"
          >
            <div style={styles.shortcutsHeader}>
              <span style={styles.shortcutsTitle}>鍵盤快捷鍵</span>
              <button
                type="button"
                style={styles.shortcutsClose}
                onClick={() => setShowShortcuts(false)}
                data-testid="shortcuts-close"
              >
                ✕
              </button>
            </div>
            <table style={styles.shortcutsTable}>
              <thead>
                <tr>
                  <th style={styles.shortcutsThKey}>按鍵</th>
                  <th style={styles.shortcutsThFn}>功能</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={styles.shortcutsTdKey}><kbd style={styles.kbd}>A</kbd></td>
                  <td style={styles.shortcutsTdFn}>切換標注模式</td>
                </tr>
                <tr>
                  <td style={styles.shortcutsTdKey}><kbd style={styles.kbd}>F</kbd></td>
                  <td style={styles.shortcutsTdFn}>專注模式</td>
                </tr>
                <tr>
                  <td style={styles.shortcutsTdKey}><kbd style={styles.kbd}>Esc</kbd></td>
                  <td style={styles.shortcutsTdFn}>關閉彈窗</td>
                </tr>
                <tr>
                  <td style={styles.shortcutsTdKey}><kbd style={styles.kbd}>?</kbd></td>
                  <td style={styles.shortcutsTdFn}>顯示此說明</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showFigmaExport && project && (
        <FigmaExportDialog
          projectId={project.id}
          shareToken={project.share_token}
          onClose={() => setShowFigmaExport(false)}
        />
      )}

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}

      {/* Onboarding tour tooltip */}
      {onboardingStep !== null && (() => {
        const steps = [
          {
            icon: '👋',
            title: '歡迎使用 Project Bridge！',
            body: '在這裡輸入你的設計需求，AI 會幫你生成互動式原型',
          },
          {
            icon: '📎',
            title: '上傳設計稿',
            body: '你可以上傳 PDF 設計稿，AI 會分析視覺樣式並應用到原型',
          },
          {
            icon: '✏',
            title: '標注模式',
            body: '生成後按 A 進入標注模式，點擊元素可以快速修改',
          },
          {
            icon: '🚀',
            title: '準備好了！',
            body: '按 ? 查看所有快捷鍵。開始你的第一個原型吧！',
          },
        ];
        const step = steps[onboardingStep];
        const isLast = onboardingStep === steps.length - 1;
        const dismiss = () => {
          localStorage.setItem('pb-onboarded', '1');
          setOnboardingStep(null);
        };
        return (
          <div style={styles.onboardingCard} data-testid="onboarding-tooltip">
            <div style={styles.onboardingTopRow}>
              <span style={styles.onboardingStepLabel}>{onboardingStep + 1} / {steps.length}</span>
              <button
                type="button"
                style={styles.onboardingSkip}
                onClick={dismiss}
                data-testid="onboarding-skip"
              >
                跳過導覽
              </button>
            </div>
            <div style={styles.onboardingIcon}>{step.icon}</div>
            <div style={styles.onboardingTitle}>{step.title}</div>
            <div style={styles.onboardingBody}>{step.body}</div>
            <button
              type="button"
              style={styles.onboardingNextBtn}
              onClick={() => {
                if (isLast) {
                  dismiss();
                } else {
                  setOnboardingStep(onboardingStep + 1);
                }
              }}
              data-testid="onboarding-next"
            >
              {isLast ? '開始使用' : '下一步 →'}
            </button>
          </div>
        );
      })()}
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
    height: '100%',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
  },
  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    backgroundColor: 'var(--bg-primary)',
  },
  loadingText: {
    color: 'var(--text-secondary)',
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
    backgroundColor: 'var(--bg-primary)',
  },
  errorTitle: {
    color: 'var(--text-primary)',
    fontSize: '18px',
    fontWeight: 600,
  },
  backBtn: {
    padding: '8px 16px',
    border: '1px solid var(--border-primary)',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    fontSize: '14px',
    cursor: 'pointer',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    backgroundColor: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border-primary)',
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
  viewModeToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    marginRight: '12px',
    backgroundColor: 'var(--bg-hover)',
    borderRadius: '8px',
    padding: '2px',
  },
  viewModeBtn: {
    padding: '4px 10px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap' as const,
  },
  viewModeBtnActive: {
    padding: '4px 10px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#8E6FA7',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap' as const,
  },
  homeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    border: '1px solid var(--border-primary)',
    borderRadius: '6px',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  projectName: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    cursor: 'pointer',
    textDecoration: 'underline dotted',
  },
  projectNameInput: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    border: '1px solid #3b82f6',
    borderRadius: '4px',
    padding: '2px 6px',
    outline: 'none',
    width: '200px',
    backgroundColor: 'var(--bg-input)',
  },
  historyBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    border: '1px solid var(--border-primary)',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  annotateBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    border: '1px solid var(--border-primary)',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
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
    border: '1px solid var(--border-primary)',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  chatPaneWrapper: {
    position: 'relative' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    flexShrink: 0,
    overflow: 'hidden',
  },
  chatPane: {
    width: '350px', // default, overridden by chatPaneWidth state
    flexShrink: 0,
    borderRight: '1px solid var(--border-primary)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid var(--border-primary)',
    backgroundColor: 'var(--bg-secondary)',
    flexShrink: 0,
  },
  tabBtn: {
    flex: 1,
    padding: '8px 0',
    border: 'none',
    borderBottom: '2px solid transparent',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
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
    borderRight: '1px solid var(--border-primary)',
    backgroundColor: 'var(--bg-secondary)',
    display: 'flex',
    flexDirection: 'column' as const,
    overflowY: 'auto' as const,
    padding: '8px 6px',
    gap: '4px',
  },
  pageSidebarLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--text-muted)',
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
    color: 'var(--text-secondary)',
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
    background: 'var(--bg-card)',
    border: '1px solid var(--border-primary)',
    borderRadius: '12px',
    boxShadow: 'var(--shadow-md)',
    padding: '12px',
    width: '300px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: 'var(--text-primary)',
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
    color: 'var(--text-secondary)',
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
    border: '1px solid var(--border-primary)',
    borderRadius: '8px',
    padding: '8px',
    fontSize: '13px',
    color: 'var(--text-primary)',
    backgroundColor: 'var(--bg-input)',
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
    border: '1px solid var(--border-primary)',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  deviceFrameBtn: {
    padding: '5px 9px',
    border: 'none',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
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
    backgroundColor: 'var(--bg-hover)',
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
  emptyStateContainer: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--bg-primary)',
    padding: '40px 24px',
  },
  emptyStateCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    textAlign: 'center' as const,
    backgroundColor: 'var(--bg-card)',
    border: '2px dashed var(--border-secondary)',
    borderRadius: '16px',
    padding: '48px 40px',
    maxWidth: '420px',
    width: '100%',
  },
  emptyStateIcon: {
    fontSize: '48px',
    lineHeight: 1,
    marginBottom: '16px',
  },
  emptyStateTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: '8px',
  },
  emptyStateSubtitle: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
    marginBottom: '20px',
  },
  emptyStateHints: {
    listStyle: 'none' as const,
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    textAlign: 'left' as const,
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },
  shortcutsBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '5px 10px',
    border: '1px solid var(--border-primary)',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  shortcutsBackdrop: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutsCard: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '400px',
    width: '90%',
    boxShadow: 'var(--shadow-md)',
    position: 'relative' as const,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: 'var(--text-primary)',
  },
  shortcutsHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
  },
  shortcutsTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  shortcutsClose: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#94a3b8',
    fontSize: '16px',
    lineHeight: 1,
    padding: '2px 4px',
  },
  shortcutsTable: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '14px',
  },
  shortcutsThKey: {
    textAlign: 'left' as const,
    padding: '6px 12px 6px 0',
    color: '#64748b',
    fontWeight: 600,
    fontSize: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    borderBottom: '1px solid #e2e8f0',
  },
  shortcutsThFn: {
    textAlign: 'left' as const,
    padding: '6px 0',
    color: '#64748b',
    fontWeight: 600,
    fontSize: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    borderBottom: '1px solid #e2e8f0',
  },
  shortcutsTdKey: {
    padding: '8px 12px 8px 0',
    verticalAlign: 'middle' as const,
    borderBottom: '1px solid #f1f5f9',
  },
  shortcutsTdFn: {
    padding: '8px 0',
    color: '#334155',
    verticalAlign: 'middle' as const,
    borderBottom: '1px solid #f1f5f9',
  },
  onboardingCard: {
    position: 'fixed' as const,
    bottom: '80px',
    right: '20px',
    zIndex: 10000,
    backgroundColor: 'var(--bg-card)',
    borderRadius: '8px',
    boxShadow: 'var(--shadow-md)',
    padding: '16px',
    maxWidth: '280px',
    width: '280px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: 'var(--text-primary)',
  },
  onboardingTopRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '10px',
  },
  onboardingStepLabel: {
    fontSize: '11px',
    color: '#94a3b8',
    fontWeight: 500,
  },
  onboardingSkip: {
    background: 'none',
    border: 'none',
    fontSize: '11px',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: 0,
  },
  onboardingIcon: {
    fontSize: '28px',
    lineHeight: 1,
    marginBottom: '8px',
  },
  onboardingTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: '6px',
  },
  onboardingBody: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    lineHeight: 1.55,
    marginBottom: '14px',
  },
  onboardingNextBtn: {
    display: 'block',
    width: '100%',
    padding: '8px',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'center' as const,
  },
  forkBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    border: '1px solid #3b82f6',
    borderRadius: '8px',
    backgroundColor: '#eff6ff',
    color: '#1d4ed8',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  userWidget: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginLeft: 4,
  } as React.CSSProperties,
  userWidgetName: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    maxWidth: 100,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  logoutBtn: {
    fontSize: 11,
    padding: '3px 8px',
    border: '1px solid var(--border-primary)',
    borderRadius: 4,
    background: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },
};
