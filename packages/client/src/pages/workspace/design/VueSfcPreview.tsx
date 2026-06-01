import { useMemo, useRef, useEffect } from 'react';
import { buildSfcIframeSrc } from '../../../lib/sfcRuntime';

export default function VueSfcPreview({ sfc }: { sfc: string }) {
  const html = useMemo(() => buildSfcIframeSrc(sfc), [sfc]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Each new sfc remounts the iframe (key change in parent forces full reload)
  useEffect(() => {
    // No-op; key prop should force remount
  }, [html]);

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
        background: 'white',
        borderRadius: 'var(--radius-md)',
      }}
    />
  );
}
