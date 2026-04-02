import { useState, useRef, useEffect, useCallback, startTransition, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import ConstraintsBar, { Constraints } from './ConstraintsBar';
import AnalysisPreviewPanel from './AnalysisPreviewPanel';
import { compressImage } from '../utils/imageCompress';
import PromptTemplateSelector from './PromptTemplateSelector';

// Memoized markdown renderer — only re-renders when content changes, not on parent re-render
const MemoMarkdown = memo(function MemoMarkdown({ content }: { content: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{content}</ReactMarkdown>;
});

function isHtmlContent(content: string): boolean {
  const t = content.trimStart().toLowerCase();
  return t.startsWith('<!doctype html') || t.startsWith('<html');
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  messageType?: 'user' | 'generate' | 'in-shell' | 'component' | 'answer';
  metadata?: { summary?: string; pages?: string[]; thinking?: string };
  files?: { name: string; id: string }[];
}

type FileIntent = 'design-spec' | 'data-spec' | 'brand-guide' | 'reference' | null;

const INTENT_OPTIONS: { value: FileIntent; label: string; color: string }[] = [
  { value: null, label: '(未分類)', color: '#94a3b8' },
  { value: 'design-spec', label: '設計稿', color: '#8b5cf6' },
  { value: 'data-spec', label: '資料規格', color: '#0ea5e9' },
  { value: 'brand-guide', label: '品牌指南', color: '#f59e0b' },
  { value: 'reference', label: '參考截圖', color: '#10b981' },
];

interface UploadedFile {
  id: string;
  filename: string;
  extractedText?: string;
  visualAnalysisReady?: boolean;
  componentLabel?: string;
  pageCount?: number;
  analysisStatus?: 'uploading' | 'analyzing' | 'ready' | 'error';
  intent?: FileIntent;
}

interface ArtStyle {
  summary: string;
  applyStyle: boolean;
}

interface Props {
  projectId: string;
  messages: ChatMessage[];
  onNewMessages: (userMsg: ChatMessage, assistantMsg: ChatMessage) => void;
  onHtmlGenerated: (data: { html: string; isMultiPage: boolean; pages: string[] }) => void;
  pendingMessage?: string | null;
  onPendingMessageConsumed?: () => void;
  hasPrototype?: boolean;
  selectedElement?: { bridgeId: string; html: string; tagName: string } | null;
  onClearSelectedElement?: () => void;
  initialChatOnly?: boolean;
}

const HISTORY_KEY = 'pb-prompt-history';
const MAX_HISTORY = 10;
const MAX_CHIPS = 5;

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(history: string[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // silently fail
  }
}

export default function ChatPanel({ projectId, messages, onNewMessages, onHtmlGenerated, pendingMessage, onPendingMessageConsumed, hasPrototype, selectedElement, onClearSelectedElement, initialChatOnly }: Props) {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [generationPhase, setGenerationPhase] = useState<'idle' | 'analyzing' | 'planning' | 'generating' | 'done' | 'parallel'>('idle');
  const [thinkingContent, setThinkingContent] = useState('');
  const [tokenCount, setTokenCount] = useState(0);
  const thinkingEndRef = useRef<HTMLDivElement>(null);
  const [activeSkillNames, setActiveSkillNames] = useState<string[]>([]);
  const [lastThinkingSummary, setLastThinkingSummary] = useState('');
  const [lastGenerationSummary, setLastGenerationSummary] = useState('');
  const [lastGeneratedPages, setLastGeneratedPages] = useState<string[]>([]);
  const [inputAreaHeight, setInputAreaHeight] = useState(() => {
    const saved = localStorage.getItem('pb-input-area-height');
    return saved ? parseInt(saved, 10) : 180;
  });
  const [pageProgress, setPageProgress] = useState<Record<string, 'pending' | 'started' | 'done' | 'error'>>({});
  const [pageDevNames, setPageDevNames] = useState<Record<string, string>>({});
  const [parallelMessage, setParallelMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; options: { id: string; label: string; description: string }[]; originalText: string } | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [viewingFile, setViewingFile] = useState<UploadedFile | null>(null);
  const pollingIntervalsRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const [editedText, setEditedText] = useState('');
  const [chatOnlyMode, setChatOnlyMode] = useState(initialChatOnly || false);
  const [constraints, setConstraints] = useState<Constraints | null>(null);
  const [artStyle, setArtStyle] = useState<ArtStyle | null>(null);
  const [artStyleLoading, setArtStyleLoading] = useState(false);
  const [uploadToast, setUploadToast] = useState<string | null>(null);
  const [viewingAnalysis, setViewingAnalysis] = useState<any>(null);
  const [promptHistory, setPromptHistory] = useState<string[]>(() => loadHistory());
  const [inputFocused, setInputFocused] = useState(false);
  const [genSettingsOpen, setGenSettingsOpen] = useState(false);
  const [genTemperature, setGenTemperature] = useState(0.3);
  const [genSeedPrompt, setGenSeedPrompt] = useState('');
  const [variantSelection, setVariantSelection] = useState<{ page: string; variants: { id: string; label: string; html: string }[] } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom on initial load + when new messages are added (not during streaming)
  const prevMsgCount = useRef(0);
  const initialScrollDone = useRef(false);
  useEffect(() => {
    if (!initialScrollDone.current && messages.length > 0) {
      // First load — scroll to bottom immediately (no animation)
      initialScrollDone.current = true;
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior }), 50);
    } else if (messages.length > prevMsgCount.current) {
      // New message added — smooth scroll
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMsgCount.current = messages.length;
  }, [messages]);

  // Auto-scroll thinking panel
  useEffect(() => {
    thinkingEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thinkingContent]);

  // No-op: thinking now shown inline in chat flow

  const fetchArtStyle = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/art-style`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.summary) {
          setArtStyle({ summary: data.summary, applyStyle: !!data.applyStyle });
        }
      }
    } catch {
      // silently fail
    }
  }, [projectId]);

  useEffect(() => {
    fetchArtStyle();
  }, [fetchArtStyle]);

  // Load generation settings on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.generation_temperature !== undefined) setGenTemperature(data.generation_temperature);
          if (data.seed_prompt !== undefined) setGenSeedPrompt(data.seed_prompt);
        }
      } catch { /* ignore */ }
    })();
  }, [projectId]);

  const saveGenSettings = useCallback(async (fields: { generation_temperature?: number; seed_prompt?: string }) => {
    try {
      await fetch(`/api/projects/${projectId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
    } catch { /* ignore */ }
  }, [projectId]);

  useEffect(() => {
    if (!uploadToast) return;
    const t = setTimeout(() => setUploadToast(null), 2500);
    return () => clearTimeout(t);
  }, [uploadToast]);

  const handleArtStyleToggle = useCallback(async (enabled: boolean) => {
    setArtStyleLoading(true);
    try {
      await fetch(`/api/projects/${projectId}/art-style`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applyStyle: enabled }),
      });
      setArtStyle(prev => prev ? { ...prev, applyStyle: enabled } : null);
    } catch {
      // silently fail
    } finally {
      setArtStyleLoading(false);
    }
  }, [projectId]);

  const handleConstraintsChange = useCallback((c: Constraints) => {
    setConstraints(c);
  }, []);

  const handleFileLabel = useCallback(async (fileId: string, label: string) => {
    setAttachedFiles(prev =>
      prev.map(f => f.id === fileId ? { ...f, componentLabel: label } : f)
    );
    try {
      await fetch(`/api/projects/${projectId}/upload/${fileId}/label`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
    } catch {
      // non-fatal
    }
  }, [projectId]);

  const handleFileIntent = useCallback(async (fileId: string, intent: FileIntent) => {
    setAttachedFiles(prev =>
      prev.map(f => f.id === fileId ? { ...f, intent } : f)
    );
    try {
      await fetch(`/api/projects/${projectId}/upload/${fileId}/label`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: intent || '' }),
      });
    } catch {
      // non-fatal
    }
  }, [projectId]);

  const uploadFile = async (rawFile: File) => {
    setUploading(true);
    setUploadProgress(0);
    try {
      // Compress large images before upload (prevent server OOM)
      const file = await compressImage(rawFile);
      const formData = new FormData();
      formData.append('file', file);

      // Simulate progress since fetch doesn't support progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 20, 90));
      }, 200);

      const res = await fetch(`/api/projects/${projectId}/upload`, {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      const data = await res.json();
      const needsAnalysis = data.analysis_status === 'pending' || data.analysis_status === 'running';
      const fileEntry: UploadedFile = {
        id: data.id,
        filename: data.originalName ?? data.filename,
        extractedText: data.extractedText,
        visualAnalysisReady: !!data.visualAnalysisReady,
        pageCount: data.pageCount ?? undefined,
        analysisStatus: needsAnalysis ? 'analyzing' : 'ready',
      };
      setAttachedFiles(prev => [...prev, fileEntry]);

      // Start polling if analysis is running
      if (needsAnalysis) {
        startAnalysisPolling(data.id);
      }

      // Show upload success feedback
      setUploadToast(needsAnalysis ? '上傳完成，分析中...' : '上傳完成');

      // Refetch art style in case a new image was uploaded
      fetchArtStyle();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to upload file');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const startAnalysisPolling = useCallback((fileId: string) => {
    // Clear existing interval for this file if any
    if (pollingIntervalsRef.current[fileId]) {
      clearInterval(pollingIntervalsRef.current[fileId]);
    }
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/upload/${fileId}/analysis-status`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'done') {
          clearInterval(pollingIntervalsRef.current[fileId]);
          delete pollingIntervalsRef.current[fileId];
          setAttachedFiles(prev => prev.map(f => f.id === fileId ? { ...f, analysisStatus: 'ready' as const } : f));
        } else if (data.status === 'error') {
          clearInterval(pollingIntervalsRef.current[fileId]);
          delete pollingIntervalsRef.current[fileId];
          setAttachedFiles(prev => prev.map(f => f.id === fileId ? { ...f, analysisStatus: 'error' as const } : f));
        }
      } catch { /* ignore polling errors */ }
    }, 2000);
    pollingIntervalsRef.current[fileId] = interval;
  }, [projectId]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      Object.values(pollingIntervalsRef.current).forEach(clearInterval);
      pollingIntervalsRef.current = {};
    };
  }, []);

  // Stop polling when file is removed
  const handleRemoveFile = useCallback((fileId: string) => {
    if (pollingIntervalsRef.current[fileId]) {
      clearInterval(pollingIntervalsRef.current[fileId]);
      delete pollingIntervalsRef.current[fileId];
    }
    setAttachedFiles(prev => prev.filter(f => f.id !== fileId));
  }, []);

  const handleViewAnalysis = useCallback(async (fileId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/upload/${fileId}/analysis-status`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === 'done' && data.result) {
        setViewingAnalysis(data.result);
      }
    } catch { /* ignore */ }
  }, [projectId]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      uploadFile(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadFile(files[0]);
    }
    // Reset so same file can be selected again
    e.target.value = '';
  };

  const sendMessage = async (text: string, opts?: { forceRegenerate?: boolean }) => {
    if (!text || streaming) return;

    // Update prompt history
    setPromptHistory(prev => {
      const deduped = [text, ...prev.filter(p => p !== text)].slice(0, MAX_HISTORY);
      saveHistory(deduped);
      return deduped;
    });

    setInput('');
    setStreaming(true);
    setStreamingContent('');
    setGenerationPhase('analyzing');
    setThinkingContent('');
    setActiveSkillNames([]);
    setTokenCount(0);
    setPageProgress({});
    setPageDevNames({});
    setError(null);
    setLastGenerationSummary('');
    setLastGeneratedPages([]);

    const fileIds = attachedFiles.map(f => f.id);
    const sentFiles = [...attachedFiles];

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      files: sentFiles.map(f => ({ name: f.filename, id: f.id })),
    };

    setLocalUserMsg(userMsg);

    // Clear attached files after sending
    setAttachedFiles([]);

    let fullContent = ''; // declared outside try so catch block can access partial content

    try {
      const body: Record<string, unknown> = { message: text };
      if (fileIds.length > 0) {
        body.fileIds = fileIds;
      }
      if (constraints) {
        body.constraints = constraints;
      }
      if (opts?.forceRegenerate) {
        body.forceRegenerate = true;
      }
      if (selectedElement) {
        body.targetBridgeId = selectedElement.bridgeId;
        body.targetHtml = selectedElement.html;
      }
      if (chatOnlyMode) {
        body.chatOnly = true;
      }

      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Chat request failed');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let accThinking = ''; // local accumulator (React state is stale in async closure)
      let receivedHtml: string | null = null;
      let receivedMessageType: 'user' | 'generate' | 'answer' | undefined;
      let receivedIsMultiPage = false;
      let lastStreamUpdate = 0; // throttle streaming React updates
      let receivedPages: string[] = [];

      let lineBuffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Buffer chunks to handle SSE lines split across TCP packets
        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split('\n');
        // Keep the last (possibly incomplete) line in the buffer
        lineBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;
          try {
            const data = JSON.parse(jsonStr);
            if (data.error) {
              setError(data.error);
              break;
            }
            // Handle confirm dialog (server asks user to choose)
            if (data.type === 'confirm') {
              setStreaming(false);
              setConfirmDialog({ message: data.message, options: data.options, originalText: text });
              return; // stop processing, wait for user choice
            }
            // Handle thinking transparency events
            if (data.type === 'thinking' && data.content) {
              // Format PAGES: line into a nice display
              const formatted = data.content.replace(/^PAGES:\s*(.+)$/gm, '\n📄 **方案確定：** $1');
              accThinking += formatted;
              // Throttle + low-priority update — don't block input
              const nowT = Date.now();
              if (!lastStreamUpdate || nowT - lastStreamUpdate > 500 || accThinking.length < 300) {
                startTransition(() => setThinkingContent(accThinking));
                lastStreamUpdate = nowT;
              }
            }
            if (data.type === 'skills' && Array.isArray(data.skills)) {
              setActiveSkillNames(data.skills);
            }
            // Handle skill conflict report
            if (data.type === 'conflict-report' && Array.isArray(data.conflicts)) {
              const conflictText = data.conflicts.map((c: any) => {
                const icon = c.severity === 'critical' ? '🔴' : c.severity === 'warning' ? '🟡' : '🔵';
                return `${icon} **${c.skillName}**：${c.rule}\n   ↳ 使用者：${c.userIntent}\n   💡 ${c.suggestion}`;
              }).join('\n\n');
              accThinking += '\n\n⚠️ **業務規則衝突檢測**\n\n' + conflictText + '\n';
              setThinkingContent(prev => prev + '\n\n⚠️ **業務規則衝突檢測**\n\n' + conflictText + '\n');
            }
            if (data.type === 'conflict-pause') {
              accThinking += '\n\n🛑 ' + (data.message || '發現關鍵衝突，自動繼續生成中...') + '\n';
              setThinkingContent(prev => prev + '\n\n🛑 ' + (data.message || '發現關鍵衝突，自動繼續生成中...') + '\n');
            }
            // Handle variant selection
            if (data.type === 'variant-select' || (data.message && typeof data.message === 'string' && data.message.includes('"type":"variant-select"'))) {
              let variantData = data;
              if (data.message && typeof data.message === 'string' && data.message.includes('variant-select')) {
                try { variantData = JSON.parse(data.message); } catch {}
              }
              if (variantData.type === 'variant-select' && variantData.variants) {
                setVariantSelection({ page: variantData.page, variants: variantData.variants });
              }
            }
            if (data.type === 'pages' && Array.isArray(data.pages)) {
              setLastGeneratedPages(data.pages);
              setThinkingContent(prev => prev + '\n\n📄 偵測到 ' + data.pages.length + ' 個頁面: ' + data.pages.join(', '));
              // Initialize all pages as pending for per-page progress
              const initial: Record<string, 'pending' | 'started' | 'done' | 'error'> = {};
              data.pages.forEach((p: string) => { initial[p] = 'pending'; });
              setPageProgress(initial);
            }
            if (data.type === 'phase') {
              if (data.phase === 'analyzing' || data.phase === 'planning' || data.phase === 'generating' || data.phase === 'done') {
                setGenerationPhase(data.phase);
              }
            }
            // Handle parallel generation progress events (no type field)
            if (!data.type && data.phase) {
              setGenerationPhase('parallel');
              if (data.phase === 'planning' || data.phase === 'tokens' || data.phase === 'assembling') {
                setParallelMessage(data.message || data.phase);
              }
              if (data.phase === 'generating' && data.page) {
                setPageProgress(prev => ({ ...prev, [data.page]: data.status || 'started' }));
                if (data.message) setPageDevNames(prev => ({ ...prev, [data.page]: data.message }));
              }
            }
            if (data.content && data.type !== 'thinking') {
              fullContent += data.content;
              // Throttle React updates — only re-render every 300ms to prevent UI freeze on long responses
              const now = Date.now();
              if (!lastStreamUpdate || now - lastStreamUpdate > 500 || fullContent.length < 300) {
                startTransition(() => {
                  setStreamingContent(fullContent);
                  setTokenCount(fullContent.length);
                });
                lastStreamUpdate = now;
              }
            }
            if (data.done) {
              if (data.html) {
                receivedHtml = data.html;
              }
              if (data.messageType) {
                receivedMessageType = data.messageType;
              }
              if (data.isMultiPage !== undefined) {
                receivedIsMultiPage = !!data.isMultiPage;
              }
              if (data.pages) {
                receivedPages = data.pages;
                setLastGeneratedPages(data.pages);
              }
              if (data.summary) {
                setLastGenerationSummary(data.summary);
              }
            }
          } catch {
            // skip malformed JSON lines
          }
        }
      }
      // Process any remaining buffered data
      if (lineBuffer.startsWith('data: ')) {
        try {
          const data = JSON.parse(lineBuffer.slice(6).trim());
          if (data.html) receivedHtml = data.html;
          if (data.messageType) receivedMessageType = data.messageType;
          if (data.isMultiPage !== undefined) receivedIsMultiPage = !!data.isMultiPage;
          if (data.pages) receivedPages = data.pages;
        } catch { /* ignore */ }
      }

      // Final flush of throttled content
      setStreamingContent(fullContent);
      setTokenCount(fullContent.length);

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: fullContent,
        messageType: receivedMessageType,
      };

      // Save thinking summary — use accumulated local var since React state is stale in closure
      setLastThinkingSummary(accThinking);

      setLocalUserMsg(null);
      setStreamingContent('');
      onNewMessages(userMsg, assistantMsg);

      if (receivedHtml) {
        onHtmlGenerated({ html: receivedHtml, isMultiPage: receivedIsMultiPage, pages: receivedPages });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      // Restore files on error
      setAttachedFiles(sentFiles);
      setLocalUserMsg(null);
      // If we had partial streaming content, save it instead of just showing error
      if (fullContent.length > 20) {
        onNewMessages(userMsg, { id: `assistant-${Date.now()}`, role: 'assistant', content: fullContent, messageType: 'answer' as const });
      } else {
        onNewMessages(userMsg, { id: `err-${Date.now()}`, role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` });
      }
    } finally {
      setStreaming(false);
      setGenerationPhase('idle');
      setPageProgress({});
    setPageDevNames({});
      setParallelMessage('');
      setTokenCount(0);
    }
  };

  const [localUserMsg, setLocalUserMsg] = useState<ChatMessage | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);

  const handleSend = () => sendMessage(input.trim());

  // Auto-send pendingMessage when set from outside (e.g. Architecture → Generate)
  useEffect(() => {
    if (pendingMessage && !streaming) {
      sendMessage(pendingMessage);
      onPendingMessageConsumed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMessage]);

  const hasUnreadyFiles = attachedFiles.some(f => f.analysisStatus === 'uploading' || f.analysisStatus === 'analyzing');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!hasUnreadyFiles) handleSend();
    }
  };

  const displayMessages = [...messages];
  if (localUserMsg) {
    displayMessages.push(localUserMsg);
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.headerTitle}>對話</h3>
      </div>

      {chatOnlyMode && (
        <div style={{
          padding: '8px 16px',
          background: '#eff6ff',
          borderBottom: '1px solid #bfdbfe',
          fontSize: '13px',
          color: '#1e40af',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span>💬 顧問模式 — 跟 AI 架構師對話，不生成 UI</span>
          <button onClick={() => setChatOnlyMode(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: '12px' }}>
            切換回設計模式
          </button>
        </div>
      )}

      {/* Generation progress bar */}
      {generationPhase !== 'idle' && (
        <div style={styles.generationProgress} data-testid="generation-progress">
          {generationPhase === 'parallel' ? (
            <div style={{ padding: '4px 0' }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#8E6FA7' }}>
                {Object.values(pageProgress).filter(s => s === 'done').length > 0
                  ? `${Object.values(pageProgress).filter(s => s === 'done').length}/${Object.keys(pageProgress).length} 頁面完成`
                  : parallelMessage || `並行生成 ${Object.keys(pageProgress).length} 個頁面...`}
              </div>
              {Object.keys(pageProgress).length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {Object.entries(pageProgress).map(([page, status]) => (
                    <div key={page} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                      <span style={{ width: 14, textAlign: 'center', color: status === 'done' ? '#22c55e' : status === 'error' ? '#ef4444' : status === 'started' ? '#3b82f6' : '#94a3b8' }}>
                        {status === 'done' ? '✓' : status === 'error' ? '✗' : status === 'started' ? '●' : '○'}
                      </span>
                      <span style={{ color: status === 'started' ? '#3b82f6' : status === 'done' ? '#22c55e' : '#64748b', fontWeight: status === 'started' ? 600 : 400 }}>
                        {page}
                      </span>
                      <span style={{ color: '#94a3b8', fontSize: 10 }}>
                        {pageDevNames[page] || (status === 'done' ? '完成' : status === 'error' ? '失敗' : status === 'started' ? '生成中...' : '等待')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Single-call stepper */}
              <div style={styles.generationSteps}>
                {(['analyzing', 'planning', 'generating', 'done'] as const).map((phase, idx) => {
                  const labels: Record<string, string> = { analyzing: '分析需求', planning: '規劃結構', generating: '生成程式碼', done: '完成' };
                  const phaseOrder: Record<string, number> = { analyzing: 0, planning: 1, generating: 2, done: 3 };
                  const isActive = generationPhase === phase;
                  const isPast = (phaseOrder[generationPhase] ?? -1) > idx;
                  const stepStyle: React.CSSProperties = {
                    ...styles.generationStep,
                    fontWeight: isActive ? 700 : 400,
                    color: isActive ? '#8E6FA7' : isPast ? '#22c55e' : '#94a3b8',
                  };
                  return (
                    <span key={phase} style={stepStyle}>
                      {isPast ? '✓ ' : isActive ? '● ' : '○ '}{labels[phase]}
                    </span>
                  );
                })}
              </div>
              <div style={styles.generationBarTrack}>
                {(() => {
                  const fillWidth = generationPhase === 'analyzing' ? '25%' : generationPhase === 'planning' ? '50%' : generationPhase === 'generating' ? '75%' : '100%';
                  const barFillStyle: React.CSSProperties = { ...styles.generationBarFill, width: fillWidth, backgroundColor: '#8E6FA7' };
                  return <div style={barFillStyle} />;
                })()}
              </div>
              {/* Token counter */}
              {tokenCount > 0 && (
                <div style={{ fontSize: 11, color: '#8E6FA7', textAlign: 'right' as const, padding: '4px 0 0 0' }}>
                  約 {tokenCount.toLocaleString()} 字
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Art Style Card */}
      {artStyle && artStyle.summary && (
        <div style={styles.artStyleCard} data-testid="art-style-card">
          <div style={styles.artStyleTop}>
            <span style={styles.artStyleTitle}>🎨 偵測到美術風格</span>
            <label style={styles.toggleLabel}>
              <input
                type="checkbox"
                checked={artStyle.applyStyle}
                onChange={e => handleArtStyleToggle(e.target.checked)}
                disabled={artStyleLoading}
                style={styles.toggleInput}
                aria-label="Apply art style"
                data-testid="art-style-toggle"
              />
              <span style={{
                ...styles.toggleSlider,
                backgroundColor: artStyle.applyStyle ? '#3b82f6' : '#cbd5e1',
              }} />
            </label>
          </div>
          <p style={styles.artStyleSummary}>{artStyle.summary}</p>
        </div>
      )}

      {/* Drop zone */}
      <div
        style={{
          ...styles.dropZone,
          borderColor: dragOver ? '#3b82f6' : '#cbd5e1',
          backgroundColor: dragOver ? '#eff6ff' : '#f8fafc',
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        data-testid="drop-zone"
      >
        <span style={styles.dropText}>
          {dragOver ? '放開以上傳' : '拖放檔案到這裡'}
        </span>
      </div>

      <div style={styles.messageList}>
        {displayMessages.length === 0 && !streaming && (
          <div style={styles.emptyChat}>
            <p style={styles.emptyChatText}>描述你的 UI 來開始生成原型。</p>
          </div>
        )}
        {displayMessages.map((msg, idx) => {
          const isHovered = hoveredMessageId === msg.id;
          const lastUserMsgBeforeThis = msg.role === 'assistant'
            ? displayMessages.slice(0, idx).filter(m => m.role === 'user').slice(-1)[0]
            : null;
          return (
            <div
              key={msg.id}
              style={msg.role === 'user' ? styles.userMsgRow : styles.assistantMsgRow}
            >
              <div
                style={styles.msgBubbleWrapper}
                onMouseEnter={() => { clearTimeout((window as any).__msgHoverTimer); setHoveredMessageId(msg.id); }}
                onMouseLeave={() => { (window as any).__msgHoverTimer = setTimeout(() => setHoveredMessageId(null), 300); }}
              >
                {isHovered && (
                  <div style={styles.messageActions}>
                    <button
                      type="button"
                      style={styles.messageActionBtn}
                      onClick={() => navigator.clipboard.writeText(msg.content)}
                      title="複製訊息"
                    >
                      📋 複製
                    </button>
                    {msg.role === 'assistant' && lastUserMsgBeforeThis && (
                      <button
                        type="button"
                        style={styles.messageActionBtn}
                        onClick={() => {
                          setInput(lastUserMsgBeforeThis.content);
                        }}
                        title="重新生成"
                      >
                        🔄 重新生成
                      </button>
                    )}
                  </div>
                )}
                {msg.role === 'user' ? (
                  <div style={styles.userBubble}>
                    {msg.files && msg.files.length > 0 && (
                      <div style={{ marginBottom: '6px', fontSize: '12px', opacity: 0.8 }}>
                        {msg.files.map((f, fi) => (
                          <span key={fi} style={{ display: 'inline-block', background: 'rgba(255,255,255,0.2)', borderRadius: '4px', padding: '2px 6px', marginRight: '4px', marginBottom: '2px' }}>
                            📎 {f.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {msg.content}
                  </div>
                ) : msg.messageType === 'answer' ? (
                  <div style={styles.answerBubble}>
                    <span style={styles.answerLabel}>💬 回答</span>
                    <div className="markdown-body" style={{ fontSize: '14px', lineHeight: '1.6' }}>
                      <MemoMarkdown content={msg.content} />
                    </div>
                  </div>
                ) : msg.messageType === 'component' ? (
                  <div style={styles.generateBubble}>
                    <span style={styles.generateTag}>🧩 已生成元件</span>
                  </div>
                ) : msg.messageType === 'in-shell' ? (
                  <div style={styles.generateBubble}>
                    <span style={styles.generateTag}>✅ 已生成子頁</span>
                  </div>
                ) : (msg.messageType === 'generate' || isHtmlContent(msg.content)) ? (
                  (() => {
                    const isLatest = idx === messages.length - 1;
                    const summary = isLatest && lastGenerationSummary ? lastGenerationSummary : msg.metadata?.summary || '';
                    const genPages = isLatest && lastGeneratedPages.length > 0 ? lastGeneratedPages : msg.metadata?.pages || [];
                    const thinking = (isLatest && lastThinkingSummary) ? lastThinkingSummary : msg.metadata?.thinking || '';
                    const versionNum = messages.filter(m => m.messageType === 'generate').indexOf(msg) + 1;
                    // Build page file list (like Figma's "Worked with X files")
                    const pageFiles = genPages.length > 0
                      ? genPages.map((p: string) => `Wrote ${p}`)
                      : ['Wrote index.html'];
                    const totalFiles = pageFiles.length + 2; // +styles +scripts
                    return (
                      <div style={{ maxWidth: '100%', padding: 0, fontSize: 13, lineHeight: 1.7, color: 'var(--text-primary, #1e293b)' }}>
                        {/* 1. Reasoning — collapsible (like Figma) */}
                        {thinking && (
                          <details open style={{ marginBottom: 14 }}>
                            <summary style={{
                              cursor: 'pointer', fontWeight: 600,
                              color: 'var(--text-primary, #1e293b)',
                              userSelect: 'none' as const,
                            }}>Reasoning ›</summary>
                            <div style={{
                              marginTop: 8,
                              color: 'var(--text-secondary, #64748b)',
                              whiteSpace: 'pre-wrap',
                            }}>{thinking}</div>
                          </details>
                        )}

                        {/* 2. Intro summary (first line of summary or fallback) */}
                        {summary && (
                          <p style={{ margin: '0 0 12px', color: 'var(--text-primary, #1e293b)' }}>
                            {summary.split('\n')[0]}
                          </p>
                        )}

                        {/* 3. Worked with X files — collapsible (like Figma) */}
                        <details style={{ marginBottom: 14 }}>
                          <summary style={{
                            cursor: 'pointer', fontWeight: 600,
                            color: 'var(--text-primary, #1e293b)',
                            userSelect: 'none' as const,
                          }}>Worked with {totalFiles} files ›</summary>
                          <div style={{ marginTop: 6, fontSize: 12, lineHeight: 2, color: 'var(--text-secondary, #64748b)' }}>
                            {genPages.length > 0 && <div>Read {genPages.length} page{genPages.length > 1 ? 's' : ''}</div>}
                            {pageFiles.map((f: string, i: number) => <div key={i}>{f}</div>)}
                            <div>Wrote styles.css</div>
                            <div>Wrote app.js</div>
                          </div>
                        </details>

                        {/* 4. Detailed summary (remaining lines after first) */}
                        {summary && summary.includes('\n') && (
                          <div style={{ whiteSpace: 'pre-wrap', marginBottom: 14 }}>
                            {summary.split('\n').slice(1).join('\n').trim()}
                          </div>
                        )}

                        {!summary && <span style={styles.generateTag}>已生成原型</span>}

                        {/* 5. Version card — like Figma's project card */}
                        <div style={{
                          marginTop: 8, padding: '12px 16px',
                          border: '1px solid var(--border-primary, #e2e8f0)',
                          borderRadius: 12, display: 'flex',
                          alignItems: 'center', justifyContent: 'space-between',
                          background: 'var(--bg-secondary, #f8fafc)',
                        }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent, #8E6FA7)' }}>
                              {genPages.length > 1 ? `${genPages.join(' / ')}` : 'Prototype'}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted, #94a3b8)', marginTop: 2 }}>
                              Version {versionNum}
                            </div>
                          </div>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div style={styles.assistantBubble}>
                    {msg.content}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {/* Thinking bubble in chat flow */}
        {streaming && thinkingContent && (
          <div style={styles.assistantMsgRow}>
            <div style={{ ...styles.assistantBubble, background: 'var(--accent-light, #f8f5ff)', borderLeft: '3px solid var(--accent, #8E6FA7)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent, #8E6FA7)', marginBottom: 4 }}>🧠 AI 思考中...</div>
              <div className="hide-scrollbar" style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 300, overflowY: 'auto' }}>
                {thinkingContent}
                <div ref={thinkingEndRef} />
              </div>
              {activeSkillNames.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>
                  🔧 使用技能: {activeSkillNames.join(', ')}
                </div>
              )}
            </div>
          </div>
        )}
        {variantSelection && (
          <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', margin: '8px 0' }}>
            <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '12px', color: '#1e293b' }}>
              📋 「{variantSelection.page}」有 {variantSelection.variants.length} 個方案，請選擇：
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {variantSelection.variants.map(v => (
                <div key={v.id} style={{
                  flex: '1 1 200px', maxWidth: '300px', border: '1px solid #e2e8f0', borderRadius: '8px',
                  overflow: 'hidden', background: '#fff', cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#3b82f6'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(59,130,246,0.15)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#e2e8f0'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
                >
                  <div style={{ height: '180px', overflow: 'hidden', borderBottom: '1px solid #f1f5f9', position: 'relative' }}>
                    <iframe
                      srcDoc={v.html}
                      sandbox="allow-scripts"
                      style={{
                        width: '250%', height: '250%', border: 'none',
                        transform: 'scale(0.4)', transformOrigin: 'top left',
                        pointerEvents: 'none',
                      }}
                      title={v.label}
                    />
                  </div>
                  <div style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#374151' }}>{v.label}</div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await fetch(`/api/projects/${projectId}/select-variant`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ page: variantSelection.page, variantHtml: v.html }),
                          });
                          setVariantSelection(null);
                          window.location.reload();
                        } catch (err) {
                          console.error('Failed to select variant:', err);
                        }
                      }}
                      style={{
                        marginTop: '8px', width: '100%', padding: '8px',
                        background: '#3b82f6', color: '#fff', border: 'none',
                        borderRadius: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                      }}
                    >
                      選這個
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {streaming && streamingContent && (
          <div style={styles.assistantMsgRow}>
            {isHtmlContent(streamingContent) ? (
              <div style={styles.generateBubble}>
                <span style={styles.generateTag}>
                  {generationPhase === 'done' ? '✅ 即將完成...' : '✏ 生成中...'}
                </span>
                {tokenCount > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)', marginLeft: 8 }}>約 {tokenCount.toLocaleString()} 字</span>}
              </div>
            ) : (
              <div style={{ ...styles.assistantBubble, fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap' as const }}>
                {streamingContent}
                <span style={styles.cursor}>|</span>
              </div>
            )}
          </div>
        )}
        {streaming && !streamingContent && !thinkingContent && (
          <div style={styles.assistantMsgRow}>
            <div style={styles.assistantBubble}>
              <span style={styles.thinking}>思考中...</span>
            </div>
          </div>
        )}
        {/* Confirm dialog — server asks user to choose action */}
        {confirmDialog && (
          <div style={styles.assistantMsgRow}>
            <div style={{ ...styles.assistantBubble, padding: '14px 18px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' }}>{confirmDialog.message}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {confirmDialog.options.map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      const origText = confirmDialog.originalText;
                      setConfirmDialog(null);
                      if (opt.id === 'regenerate') {
                        sendMessage(origText, { forceRegenerate: true });
                      } else {
                        sendMessage(origText);
                      }
                    }}
                    style={{
                      padding: '10px 16px',
                      border: opt.id === 'regenerate' ? '2px solid var(--accent, #8E6FA7)' : '1px solid var(--border-primary)',
                      borderRadius: 10,
                      background: opt.id === 'regenerate' ? 'var(--accent-light, rgba(142,111,167,0.08))' : 'var(--bg-secondary)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      flex: 1,
                      minWidth: 140,
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{opt.description}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {error && (
          <div style={styles.errorRow}>
            <p style={styles.errorText}>{error}</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Vertical resize handle — drag up to expand input area */}
      <div
        style={{ height: 8, cursor: 'row-resize', background: 'var(--border-primary, #e2e8f0)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onMouseDown={(e) => {
          e.preventDefault();
          const startY = e.clientY;
          const wrapper = (e.currentTarget as HTMLElement).nextElementSibling as HTMLElement;
          const startH = wrapper?.offsetHeight || 180;
          const handle = e.currentTarget as HTMLDivElement;
          handle.style.background = 'var(--accent, #8E6FA7)';
          document.body.style.cursor = 'row-resize';
          document.body.style.userSelect = 'none';
          const onMove = (ev: MouseEvent) => {
            const delta = startY - ev.clientY;
            const newH = Math.max(120, Math.min(500, startH + delta));
            if (wrapper) wrapper.style.height = newH + 'px';
          };
          const onUp = (ev: MouseEvent) => {
            const delta = startY - ev.clientY;
            const finalH = Math.max(120, Math.min(500, startH + delta));
            setInputAreaHeight(finalH);
            localStorage.setItem('pb-input-area-height', String(finalH));
            handle.style.background = 'var(--border-primary, #e2e8f0)';
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--accent, #8E6FA7)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--border-primary, #e2e8f0)'; }}
      >
        <div style={{ width: 40, height: 3, borderRadius: 2, background: 'var(--text-muted, #94a3b8)' }} />
      </div>
      <div style={{ height: inputAreaHeight, minHeight: 120, maxHeight: 500, flex: 'none', display: 'flex', flexDirection: 'column' as const, overflow: 'auto' }}>
      <ConstraintsBar projectId={projectId} onChange={handleConstraintsChange} />

      {/* Generation Settings */}
      <div style={styles.genSettingsWrapper}>
        <button
          type="button"
          style={styles.genSettingsToggle}
          onClick={() => setGenSettingsOpen(prev => !prev)}
          data-testid="gen-settings-toggle"
        >
          {genSettingsOpen ? '▾' : '▸'} 生成設定
        </button>
        {genSettingsOpen && (
          <div style={styles.genSettingsPanel} data-testid="gen-settings-panel">
            <div style={styles.genSettingsRow}>
              <label style={styles.genSettingsLabel}>
                溫度 (Temperature): {genTemperature.toFixed(1)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={genTemperature}
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  setGenTemperature(val);
                  saveGenSettings({ generation_temperature: val });
                }}
                style={styles.genSettingsSlider}
                title="生成溫度"
                aria-label="生成溫度"
                data-testid="temperature-slider"
              />
              <div style={styles.genSettingsSliderLabels}>
                <span>0.0 精確</span>
                <span>1.0 創意</span>
              </div>
            </div>
            <div style={styles.genSettingsRow}>
              <label style={styles.genSettingsLabel}>種子提示 (Seed Prompt)</label>
              <textarea
                style={styles.genSettingsSeedTextarea}
                value={genSeedPrompt}
                onChange={e => setGenSeedPrompt(e.target.value)}
                onBlur={() => saveGenSettings({ seed_prompt: genSeedPrompt })}
                placeholder="每次生成時自動附加的提示詞..."
                rows={3}
                data-testid="seed-prompt-textarea"
              />
            </div>
          </div>
        )}
      </div>

      {/* Attached files chips */}
      {attachedFiles.length > 0 && (
        <div style={styles.fileChips}>
          {attachedFiles.map(f => (
            <div key={f.id} style={styles.fileChipWrapper} data-testid="file-chip">
              <div style={styles.fileChip}>
                {f.analysisStatus === 'ready' ? (
                  <button
                    type="button"
                    style={{ ...styles.fileName, ...styles.fileNameClickable }}
                    onClick={() => handleViewAnalysis(f.id)}
                    title="檢視分析結果"
                    data-testid="analysis-preview-btn"
                  >
                    {f.filename}
                  </button>
                ) : (
                  <span style={styles.fileName}>{f.filename}</span>
                )}
                {f.analysisStatus === 'analyzing' && (
                  <span style={{ fontSize: 11, color: '#3b82f6', fontWeight: 500 }} data-testid="analysis-badge">◌ 分析中...</span>
                )}
                {f.analysisStatus === 'ready' && (
                  <button
                    type="button"
                    style={styles.analysisReadyBadge}
                    onClick={() => handleViewAnalysis(f.id)}
                    data-testid="analysis-ready-badge"
                    title="檢視分析結果"
                  >
                    ✓ 分析完成
                  </button>
                )}
                {f.analysisStatus === 'error' && (
                  <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 500 }} data-testid="analysis-badge">⚠ 分析失敗</span>
                )}
                {f.visualAnalysisReady ? (
                  <span style={styles.visualBadge} data-testid="visual-analysis-badge" title="視覺分析已完成">
                    👁 Visual
                  </span>
                ) : (
                  <button
                    type="button"
                    style={styles.reanalyzeBtn}
                    title="重新執行視覺分析"
                    onClick={async () => {
                      try {
                        const r = await fetch(`/api/projects/${projectId}/upload/${f.id}/reanalyze`, { method: 'POST' });
                        if (r.ok) {
                          setAttachedFiles(prev => prev.map(x => x.id === f.id ? { ...x, visualAnalysisReady: true } : x));
                          setUploadToast('視覺分析完成！');
                        } else {
                          const err = await r.json();
                          setUploadToast(`分析失敗: ${err.error}`);
                        }
                      } catch { setUploadToast('分析失敗'); }
                    }}
                  >
                    🔍 分析設計稿
                  </button>
                )}
                {f.pageCount != null && f.pageCount > 1 && (
                  <span style={styles.pageCountBadge} data-testid="page-count-badge" title={`PDF 共 ${f.pageCount} 頁`}>
                    📄 {f.pageCount} pages
                  </span>
                )}
                {f.extractedText && (
                  <button
                    type="button"
                    style={styles.extractedBadge}
                    onClick={() => { setViewingFile(f); setEditedText(f.extractedText || ''); }}
                  >
                    Text extracted
                  </button>
                )}
                <button
                  type="button"
                  style={styles.removeFileBtn}
                  onClick={() => handleRemoveFile(f.id)}
                >
                  x
                </button>
              </div>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <select
                  style={styles.labelSelect}
                  value={f.componentLabel || ''}
                  onChange={e => handleFileLabel(f.id, e.target.value)}
                  data-testid="file-label-select"
                  aria-label="標記用途"
                >
                  <option value="">{f.pageCount != null && f.pageCount > 1 ? `PDF 有 ${f.pageCount} 頁 — 標記整體用途` : '標記用途（可選）'}</option>
                  <option value="卡片樣式">卡片樣式</option>
                  <option value="導覽列">導覽列</option>
                  <option value="搜尋列">搜尋列</option>
                  <option value="標籤元件">標籤元件</option>
                  <option value="整體風格">整體風格</option>
                  <option value="配色方案">配色方案</option>
                </select>
                <select
                  style={{
                    ...styles.labelSelect,
                    borderColor: f.intent ? (INTENT_OPTIONS.find(o => o.value === f.intent)?.color || '#cbd5e1') : '#cbd5e1',
                    color: f.intent ? (INTENT_OPTIONS.find(o => o.value === f.intent)?.color || '#475569') : '#475569',
                    fontWeight: f.intent ? 600 : 400,
                  }}
                  value={f.intent || ''}
                  onChange={e => handleFileIntent(f.id, (e.target.value || null) as FileIntent)}
                  data-testid="file-intent-select"
                  aria-label="檔案意圖"
                >
                  {INTENT_OPTIONS.map(opt => (
                    <option key={opt.value ?? '__null'} value={opt.value ?? ''}>{opt.label}</option>
                  ))}
                </select>
                {f.intent && (() => {
                  const opt = INTENT_OPTIONS.find(o => o.value === f.intent);
                  return opt ? (
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        padding: '1px 6px',
                        borderRadius: '8px',
                        backgroundColor: opt.color + '20',
                        color: opt.color,
                        whiteSpace: 'nowrap',
                      }}
                      data-testid="file-intent-badge"
                    >
                      {opt.label}
                    </span>
                  ) : null;
                })()}
              </div>
            </div>
          ))}
        </div>
      )}

      {uploading && (
        <div style={styles.uploadProgress}>
          <div style={{ ...styles.uploadBar, width: `${uploadProgress}%` }} />
        </div>
      )}

      {/* Prompt history chips */}
      {(inputFocused || promptHistory.length > 0) && promptHistory.length > 0 && (
        <div style={styles.historyChips} data-testid="prompt-history-chips">
          {promptHistory.slice(0, MAX_CHIPS).map((p, i) => (
            <div key={i} style={styles.historyChip}>
              <button
                type="button"
                style={styles.historyChipText}
                onClick={() => setInput(p)}
                title={p}
              >
                {p.length > 30 ? p.slice(0, 30) + '…' : p}
              </button>
              <button
                type="button"
                style={styles.historyChipRemove}
                onClick={() => setPromptHistory(prev => {
                  const next = prev.filter((_, idx) => idx !== i);
                  saveHistory(next);
                  return next;
                })}
                aria-label="Remove from history"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {selectedElement && (
        <div style={{ padding: '8px 12px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '6px', margin: '0 8px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
          <span>🎯 已選取：<strong>&lt;{selectedElement.tagName}&gt;</strong> [{selectedElement.bridgeId}]</span>
          <button type="button" onClick={() => onClearSelectedElement?.()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#92400e', padding: '0 4px' }}>✕</button>
        </div>
      )}
      <div style={styles.inputArea}>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
          data-testid="file-input"
        />
        {/* 顧問 button moved next to send button */}
        {hasPrototype && (
          <button
            style={{ ...styles.attachBtn, fontSize: 11, color: '#f59e0b', fontWeight: 600 }}
            onClick={() => sendMessage(input.trim() || '請依照設計規範重新生成所有頁面', { forceRegenerate: true })}
            title="強制重新生成（忽略微調模式）"
            disabled={streaming}
            data-testid="regenerate-btn"
          >
            🔄
          </button>
        )}
        <button
          style={styles.attachBtn}
          onClick={() => fileInputRef.current?.click()}
          title="附加檔案"
          disabled={uploading || streaming}
          data-testid="attach-file-btn"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 8.5l-5.5 5.5a3.5 3.5 0 01-5-5L9 3.5a2.33 2.33 0 013.3 3.3L6.8 12.3a1.17 1.17 0 01-1.6-1.6L10.7 5" />
          </svg>
        </button>
        <PromptTemplateSelector onSelect={(content) => setInput(content)} disabled={streaming} />
        <textarea
          ref={textareaRef}
          style={styles.textarea}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={(e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
              if (items[i].type.startsWith('image/')) {
                e.preventDefault();
                const file = items[i].getAsFile();
                if (file) uploadFile(file);
                return;
              }
            }
          }}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          placeholder={chatOnlyMode ? "輸入問題...（對話模式，不會生成 UI）" : "描述你的 UI...（可貼上截圖）"}
          rows={2}
          disabled={streaming}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignSelf: 'stretch' }}>
          <button
            style={{
              flex: 1,
              padding: '0 12px',
              fontSize: '12px',
              fontWeight: chatOnlyMode ? 700 : 500,
              color: chatOnlyMode ? '#fff' : '#6b7280',
              background: chatOnlyMode ? '#3b82f6' : 'var(--bg-hover, #f1f5f9)',
              border: chatOnlyMode ? 'none' : '1px solid var(--border-primary, #e2e8f0)',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap' as const,
              minWidth: '50px',
            }}
            onClick={() => setChatOnlyMode(prev => !prev)}
            title={chatOnlyMode ? '顧問模式開啟中（不生成 UI）' : '切換到顧問模式（純對話）'}
            data-testid="chat-only-btn"
          >
            💬<br/>顧問
          </button>
        </div>
        <button
          style={{
            ...styles.sendBtn,
            alignSelf: 'stretch',
            height: 'auto',
            opacity: (!input.trim() || streaming) ? 0.5 : 1,
          }}
          onClick={handleSend}
          disabled={!input.trim() || streaming || hasUnreadyFiles}
          title={hasUnreadyFiles ? '等待檔案分析完成...' : attachedFiles.some(f => f.analysisStatus === 'error') ? '部分檔案分析失敗，仍可送出' : ''}
          data-testid="send-btn"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 9l6-6v4h8v4H8v4L2 9z" fill="white" />
          </svg>
        </button>
      </div>
      </div>{/* end resizable input area wrapper */}

      {/* Upload success toast */}
      {uploadToast && (
        <div style={styles.uploadToast} data-testid="upload-toast">
          {uploadToast}
        </div>
      )}

      {/* Analysis preview panel */}
      {viewingAnalysis && (
        <AnalysisPreviewPanel
          analysisResult={viewingAnalysis}
          onClose={() => setViewingAnalysis(null)}
        />
      )}

      {/* File text modal */}
      {viewingFile && (
        <div style={styles.modalOverlay} onClick={() => setViewingFile(null)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>{viewingFile.filename}</h3>
            <textarea
              style={styles.modalTextarea}
              value={editedText}
              onChange={e => setEditedText(e.target.value)}
              rows={12}
            />
            <div style={styles.modalActions}>
              <button style={styles.modalCancelBtn} onClick={() => setViewingFile(null)}>關閉</button>
              <button
                style={styles.modalSaveBtn}
                onClick={() => {
                  setAttachedFiles(prev =>
                    prev.map(f => f.id === viewingFile.id ? { ...f, extractedText: editedText } : f)
                  );
                  setViewingFile(null);
                }}
              >
                更新
              </button>
            </div>
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
    overflow: 'hidden',
    backgroundColor: 'var(--bg-primary)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    position: 'relative' as const,
    color: 'var(--text-primary)',
  },
  header: {
    padding: '12px 16px',
    borderBottom: '1px solid var(--border-primary)',
    backgroundColor: 'var(--bg-secondary)',
  },
  headerTitle: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  artStyleCard: {
    margin: '8px 12px 0',
    padding: '10px 12px',
    backgroundColor: 'var(--bg-hover)',
    border: '1px solid var(--border-primary)',
    borderRadius: '8px',
  },
  artStyleTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '4px',
  },
  artStyleTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  artStyleSummary: {
    margin: 0,
    fontSize: '11px',
    color: 'var(--text-secondary)',
    lineHeight: '1.4',
  },
  toggleLabel: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    cursor: 'pointer',
    width: '36px',
    height: '20px',
    flexShrink: 0,
  },
  toggleInput: {
    position: 'absolute',
    opacity: 0,
    width: 0,
    height: 0,
  },
  toggleSlider: {
    position: 'absolute',
    inset: 0,
    borderRadius: '10px',
    transition: 'background-color 0.2s',
  },
  dropZone: {
    margin: '8px 12px 0',
    padding: '10px',
    border: '2px dashed var(--border-secondary)',
    borderRadius: '8px',
    textAlign: 'center' as const,
    transition: 'border-color 0.15s, background-color 0.15s',
  },
  dropText: {
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  messageList: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  emptyChat: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  emptyChatText: {
    color: 'var(--text-muted)',
    fontSize: '14px',
    textAlign: 'center',
  },
  userMsgRow: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  assistantMsgRow: {
    display: 'flex',
    justifyContent: 'flex-start',
  },
  userBubble: {
    maxWidth: '85%',
    padding: '10px 14px',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    borderRadius: '14px 14px 4px 14px',
    fontSize: '14px',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  assistantBubble: {
    maxWidth: '85%',
    padding: '10px 14px',
    backgroundColor: 'var(--bg-hover)',
    color: 'var(--text-primary)',
    borderRadius: '14px 14px 14px 4px',
    fontSize: '13px',
    lineHeight: '1.5',
    fontFamily: '"SF Mono", "Fira Code", "Consolas", monospace',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    maxHeight: '200px',
    overflowY: 'auto',
  },
  answerBubble: {
    maxWidth: '100%',
    width: '100%',
    padding: '16px 20px',
    backgroundColor: '#f8fafc',
    color: '#1e293b',
    borderRadius: '8px',
    borderLeft: '3px solid #3b82f6',
    fontSize: '14px',
    lineHeight: '1.7',
    fontFamily: 'inherit',
    whiteSpace: 'normal' as const,
    wordBreak: 'break-word' as const,
  },
  generateBubble: {
    maxWidth: '85%',
    padding: '10px 14px',
    backgroundColor: 'var(--bg-hover)',
    color: 'var(--text-primary)',
    borderRadius: '14px 14px 14px 4px',
    fontSize: '13px',
    lineHeight: '1.5',
    fontFamily: '"SF Mono", "Fira Code", "Consolas", monospace',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    maxHeight: '200px',
    overflowY: 'auto' as const,
  },
  generateTag: {
    display: 'inline-block',
    marginTop: '6px',
    padding: '2px 8px',
    backgroundColor: '#dcfce7',
    color: '#166534',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: 600 as const,
  },
  answerLabel: {
    fontSize: '11px',
    color: '#3b82f6',
    fontWeight: 600 as const,
    marginBottom: '4px',
    display: 'block',
  },
  cursor: {
    animation: 'blink 1s infinite',
    color: '#64748b',
  },
  thinking: {
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  errorRow: {
    padding: '8px 12px',
    backgroundColor: '#fef2f2',
    borderRadius: '8px',
    border: '1px solid #fecaca',
  },
  errorText: {
    margin: 0,
    fontSize: '13px',
    color: '#ef4444',
  },
  fileChips: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '6px',
    padding: '6px 16px',
    flexShrink: 0,
  },
  fileChipWrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  fileChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    backgroundColor: 'var(--bg-hover)',
    borderRadius: '14px',
    fontSize: '12px',
    color: 'var(--text-primary)',
  },
  labelSelect: {
    fontSize: '11px',
    padding: '2px 6px',
    border: '1px solid var(--border-secondary)',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-input)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    outline: 'none',
  },
  fileName: {
    fontWeight: 500,
    maxWidth: '120px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  fileNameClickable: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    color: '#2563eb',
    textDecoration: 'underline',
    textDecorationColor: 'transparent',
    transition: 'text-decoration-color 0.15s',
    fontSize: 'inherit',
    fontFamily: 'inherit',
  },
  analysisReadyBadge: {
    padding: '1px 6px',
    backgroundColor: '#dcfce7',
    color: '#166534',
    borderRadius: '8px',
    fontSize: '10px',
    fontWeight: 600,
    border: '1px solid #bbf7d0',
    cursor: 'pointer',
  },
  extractedBadge: {
    padding: '1px 6px',
    backgroundColor: '#dbeafe',
    color: '#2563eb',
    border: 'none',
    borderRadius: '8px',
    fontSize: '10px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  visualBadge: {
    padding: '1px 6px',
    backgroundColor: '#d1fae5',
    color: '#065f46',
    borderRadius: '8px',
    fontSize: '10px',
    fontWeight: 600,
  },
  reanalyzeBtn: {
    padding: '1px 6px',
    backgroundColor: '#fef3c7',
    color: '#92400e',
    borderRadius: '8px',
    fontSize: '10px',
    fontWeight: 600,
    border: '1px solid #fcd34d',
    cursor: 'pointer',
  },
  pageCountBadge: {
    padding: '1px 6px',
    backgroundColor: '#f1f5f9',
    color: '#475569',
    borderRadius: '8px',
    fontSize: '10px',
    fontWeight: 500,
  },
  uploadToast: {
    position: 'absolute' as const,
    bottom: '72px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '7px 14px',
    backgroundColor: '#16a34a',
    color: '#ffffff',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: 100,
  },
  removeFileBtn: {
    width: '16px',
    height: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '12px',
    padding: 0,
  },
  uploadProgress: {
    margin: '0 16px 4px',
    height: '3px',
    backgroundColor: '#e2e8f0',
    borderRadius: '2px',
    overflow: 'hidden',
    flexShrink: 0,
  },
  uploadBar: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: '2px',
    transition: 'width 0.2s',
  },
  inputArea: {
    display: 'flex',
    gap: '6px',
    padding: '12px 16px',
    borderTop: '1px solid var(--border-primary)',
    backgroundColor: 'var(--bg-secondary)',
    alignItems: 'stretch',
    flex: 1,
    minHeight: 0,
  },
  attachBtn: {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-primary)',
    borderRadius: '10px',
    cursor: 'pointer',
    flexShrink: 0,
    color: 'var(--text-secondary)',
  },
  textarea: {
    flex: 1,
    padding: '10px 12px',
    border: '1px solid var(--border-primary)',
    borderRadius: '10px',
    fontSize: '14px',
    resize: 'none' as const,
    outline: 'none',
    fontFamily: 'inherit',
    lineHeight: '1.4',
    backgroundColor: 'var(--bg-input)',
    color: 'var(--text-primary)',
  },
  sendBtn: {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  },
  modal: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: '12px',
    padding: '20px',
    width: '480px',
    maxWidth: '90vw',
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
  },
  modalTitle: {
    margin: '0 0 12px',
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  modalTextarea: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid var(--border-primary)',
    borderRadius: '8px',
    fontSize: '13px',
    resize: 'vertical' as const,
    outline: 'none',
    fontFamily: '"SF Mono", "Fira Code", "Consolas", monospace',
    lineHeight: '1.5',
    boxSizing: 'border-box' as const,
    backgroundColor: 'var(--bg-input)',
    color: 'var(--text-primary)',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '12px',
  },
  modalCancelBtn: {
    padding: '6px 14px',
    border: '1px solid var(--border-primary)',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    fontSize: '13px',
    cursor: 'pointer',
  },
  modalSaveBtn: {
    padding: '6px 14px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  historyChips: {
    display: 'flex',
    flexWrap: 'nowrap' as const,
    overflowX: 'auto' as const,
    gap: '6px',
    padding: '6px 16px 2px',
    scrollbarWidth: 'none' as const,
  },
  historyChip: {
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
    backgroundColor: 'var(--bg-hover)',
    borderRadius: '999px',
    border: '1px solid var(--border-primary)',
    overflow: 'hidden',
  },
  historyChipText: {
    padding: '3px 8px',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    maxWidth: '180px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  historyChipRemove: {
    padding: '3px 6px 3px 2px',
    fontSize: '10px',
    color: '#94a3b8',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    lineHeight: 1,
  },
  generationProgress: {
    padding: '8px 16px 6px',
    borderBottom: '1px solid var(--border-primary)',
    backgroundColor: 'var(--bg-secondary)',
  },
  generationSteps: {
    display: 'flex',
    gap: '16px',
    marginBottom: '6px',
  },
  generationStep: {
    fontSize: '12px',
    transition: 'color 0.3s',
  },
  generationBarTrack: {
    height: '3px',
    backgroundColor: '#e2e8f0',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  generationBarFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: '2px',
    transition: 'width 0.5s ease',
  },
  msgBubbleWrapper: {
    position: 'relative' as const,
    display: 'inline-block',
    maxWidth: '100%',
  },
  messageActions: {
    display: 'flex',
    gap: '4px',
    marginTop: '4px',
  },
  messageActionBtn: {
    fontSize: '11px',
    padding: '2px 6px',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-primary)',
    borderRadius: '4px',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    boxShadow: 'var(--shadow-sm)',
    color: 'var(--text-secondary)',
  },
  genSettingsWrapper: {
    padding: '4px 16px 0',
    flexShrink: 0,
  },
  genSettingsToggle: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    fontWeight: 600,
    padding: '4px 0',
  },
  genSettingsPanel: {
    padding: '8px 0',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
  },
  genSettingsRow: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  genSettingsLabel: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    fontWeight: 500,
  },
  genSettingsSlider: {
    width: '100%',
    accentColor: '#3b82f6',
  },
  genSettingsSliderLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '10px',
    color: '#94a3b8',
  },
  genSettingsSeedTextarea: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid var(--border-primary)',
    borderRadius: '8px',
    fontSize: '12px',
    resize: 'vertical' as const,
    outline: 'none',
    fontFamily: 'inherit',
    lineHeight: '1.4',
    boxSizing: 'border-box' as const,
    backgroundColor: 'var(--bg-input)',
    color: 'var(--text-primary)',
  },
};
