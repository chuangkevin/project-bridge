import { useMemo, useRef, useEffect } from 'react';
import { buildSfcIframeSrc } from '../../../lib/sfcRuntime';

export default function VueSfcPreview({ sfc, bridgeMode = 'browse' }: { sfc: string; bridgeMode?: 'browse' | 'annotate' | 'regen' | 'component' }) {
  const html = useMemo(() => buildSfcIframeSrc(sfc), [sfc]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Each new sfc remounts the iframe (key change in parent forces full reload)
  useEffect(() => {
    // No-op; key prop should force remount
  }, [html]);

  useEffect(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'set-bridge-mode', mode: bridgeMode }, '*');
    }
  }, [bridgeMode]);

  return (
    <iframe
      ref={iframeRef}
      title="Vue SFC Preview"
      srcDoc={html}
      sandbox="allow-scripts allow-same-origin"
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        // 跟著生成內容走，不要硬塞白底 — 深色設計會在邊緣漏出白邊
        background: 'transparent',
        borderRadius: 'var(--radius-md)',
      }}
    />
  );
}
