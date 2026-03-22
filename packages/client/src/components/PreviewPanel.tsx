import { useRef, useEffect, useCallback } from 'react';
import { BRIDGE_SCRIPT } from '../utils/bridgeScript';

export type InteractionMode = 'browse' | 'annotate' | 'api-binding' | 'visual-edit' | 'page-mapping';

interface Props {
  html: string | null;
  deviceSize: 'desktop' | 'tablet' | 'mobile';
  annotationMode?: boolean;
  interactionMode?: InteractionMode;
  onElementClick?: (data: { bridgeId: string; tagName: string; textContent: string; rect: { x: number; y: number; width: number; height: number } }) => void;
  onIndicatorClick?: (bridgeId: string) => void;
  annotations?: { bridgeId: string; number: number }[];
  apiBindings?: { bridgeId: string }[];
}

export default function PreviewPanel({ html, deviceSize, annotationMode, interactionMode, onElementClick, onIndicatorClick, annotations, apiBindings }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Derive effective mode: interactionMode takes priority over boolean annotationMode
  const effectiveMode: InteractionMode = interactionMode || (annotationMode ? 'annotate' : 'browse');

  const handleMessage = useCallback((e: MessageEvent) => {
    if (!e.data || !e.data.type) return;
    if (e.data.type === 'element-click' && (effectiveMode === 'annotate' || effectiveMode === 'api-binding') && onElementClick) {
      onElementClick(e.data);
    }
    if (e.data.type === 'indicator-click' && onIndicatorClick) {
      onIndicatorClick(e.data.bridgeId);
    }
    if (e.data.type === 'show-page' && iframeRef.current?.contentWindow) {
      const name = e.data.name as string;
      try {
        (iframeRef.current.contentWindow as any).eval(`typeof showPage === 'function' && showPage(${JSON.stringify(name)})`);
      } catch {}
    }
  }, [effectiveMode, onElementClick, onIndicatorClick]);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Send annotation mode state to iframe
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage({ type: 'set-annotation-mode', enabled: effectiveMode === 'annotate' }, '*');
  }, [effectiveMode]);

  // Send API binding mode state to iframe
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage({ type: 'set-api-binding-mode', enabled: effectiveMode === 'api-binding' }, '*');
    iframe.contentWindow.postMessage({ type: 'set-visual-edit-mode', enabled: effectiveMode === 'visual-edit' }, '*');
    iframe.contentWindow.postMessage({ type: 'set-page-mapping-mode', enabled: effectiveMode === 'page-mapping' }, '*');
  }, [effectiveMode]);

  // Send annotation indicators to iframe
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || !annotations) return;
    iframe.contentWindow.postMessage({ type: 'show-indicators', annotations }, '*');
  }, [annotations]);

  // Send API binding indicators to iframe
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || !apiBindings) return;
    if (effectiveMode === 'api-binding') {
      iframe.contentWindow.postMessage({ type: 'show-api-indicators', bindings: apiBindings }, '*');
    }
  }, [apiBindings, effectiveMode]);

  // Resend indicators after iframe loads
  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    if (annotations && annotations.length > 0) {
      iframe.contentWindow.postMessage({ type: 'show-indicators', annotations }, '*');
    }
    if (effectiveMode === 'annotate') {
      iframe.contentWindow.postMessage({ type: 'set-annotation-mode', enabled: true }, '*');
    }
    if (effectiveMode === 'api-binding') {
      iframe.contentWindow.postMessage({ type: 'set-api-binding-mode', enabled: true }, '*');
      if (apiBindings && apiBindings.length > 0) {
        iframe.contentWindow.postMessage({ type: 'show-api-indicators', bindings: apiBindings }, '*');
      }
    }
  }, [annotations, apiBindings, effectiveMode]);

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
        <p style={styles.emptyText}>在對話面板中描述你的 UI 來生成原型</p>
      </div>
    );
  }

  // Inject bridge script before </body>
  let injectedHtml = html;
  if (html.includes('</body>')) {
    injectedHtml = html.replace('</body>', BRIDGE_SCRIPT + '</body>');
  } else {
    injectedHtml = html + BRIDGE_SCRIPT;
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
        ref={iframeRef}
        style={iframeStyle}
        sandbox="allow-scripts allow-same-origin"
        srcDoc={injectedHtml}
        title="原型預覽"
        onLoad={handleIframeLoad}
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
