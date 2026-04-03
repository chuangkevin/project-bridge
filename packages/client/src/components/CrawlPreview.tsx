import { useRef, useEffect, useCallback } from 'react';
import { getSelectionScript } from '../utils/selectionScript';

interface Props {
  html: string;
  zoom: number;
  extractMode: boolean;
  onExtract: (data: { html: string; css: string }) => void;
  onZoomChange: (zoom: number) => void;
}

/**
 * CrawlPreview renders crawled page HTML in a sandboxed iframe.
 * When extractMode is true, the selection script is injected so the user
 * can hover (blue highlight) and click (green confirm) to pick a component.
 * The extracted outerHTML + computed CSS are passed to onExtract.
 */
export default function CrawlPreview({ html, zoom, extractMode, onExtract, onZoomChange }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Build the srcdoc — inject selection script when extractMode is on
  const srcdoc = (() => {
    let doc = html;
    if (extractMode) {
      const script = getSelectionScript();
      if (doc.includes('</body>')) {
        doc = doc.replace('</body>', script + '</body>');
      } else {
        doc = doc + script;
      }
    }
    return doc;
  })();

  // Listen for postMessage from iframe
  const handleMessage = useCallback((e: MessageEvent) => {
    if (!e.data || e.data.type !== 'component-extracted') return;
    if (!extractMode) return;

    const rawHtml: string = e.data.html || '';
    const rawCss: string = e.data.css || '';

    // Scope the CSS with a unique hash prefix and wrap HTML
    const hash = 'crawled-' + Math.random().toString(36).slice(2, 8);
    const scopedCss = rawCss ? `.${hash} { ${rawCss} }` : '';
    const scopedHtml = `<div class="${hash}">${rawHtml}</div>`;

    onExtract({ html: scopedHtml, css: scopedCss });
  }, [extractMode, onExtract]);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Zoom controls
  const zoomIn = () => onZoomChange(Math.min(zoom + 25, 200));
  const zoomOut = () => onZoomChange(Math.max(zoom - 25, 25));
  const zoomReset = () => onZoomChange(100);

  const scale = zoom / 100;

  return (
    <div style={styles.wrapper}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          {extractMode && (
            <span style={styles.extractBadge}>
              <span style={styles.extractDot} />
              選取模式
            </span>
          )}
        </div>
        <div style={styles.toolbarRight}>
          <button type="button" style={styles.zoomBtn} onClick={zoomOut} title="縮小">−</button>
          <button type="button" style={styles.zoomLabel} onClick={zoomReset} title="重設縮放">
            {zoom}%
          </button>
          <button type="button" style={styles.zoomBtn} onClick={zoomIn} title="放大">+</button>
        </div>
      </div>

      {/* Iframe container */}
      <div style={styles.iframeContainer}>
        <div style={{
          ...styles.iframeScaler,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: `${100 / scale}%`,
          height: `${100 / scale}%`,
        }}>
          <iframe
            ref={iframeRef}
            srcDoc={srcdoc}
            style={styles.iframe}
            sandbox="allow-scripts allow-same-origin"
            title="爬取預覽"
          />
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    backgroundColor: '#f1f5f9',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 12px',
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e2e8f0',
    flexShrink: 0,
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  extractBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '3px 10px',
    backgroundColor: '#eff6ff',
    color: '#2563eb',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  extractDot: {
    display: 'inline-block',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#3b82f6',
  },
  zoomBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    color: '#475569',
    fontSize: '16px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: 0,
    lineHeight: 1,
  },
  zoomLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '48px',
    height: '28px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    backgroundColor: '#f8fafc',
    color: '#475569',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: '0 6px',
  },
  iframeContainer: {
    flex: 1,
    overflow: 'auto',
    position: 'relative',
  },
  iframeScaler: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  iframe: {
    width: '100%',
    height: '100%',
    border: 'none',
    backgroundColor: '#ffffff',
  },
};
