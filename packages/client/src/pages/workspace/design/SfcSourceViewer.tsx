import { useState } from 'react';

export default function SfcSourceViewer({ source }: { source: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback noop
    }
  };

  const lines = source.split('\n');

  return (
    <div className="sfc-source">
      <div className="sfc-source__toolbar">
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          {lines.length} 行 · {source.length} 字元
        </span>
        <button onClick={handleCopy} className="sfc-source__copy">
          {copied ? '✓ 已複製' : '複製'}
        </button>
      </div>
      <pre className="sfc-source__code">
        {lines.map((line, i) => (
          <div key={i} className="sfc-source__line">
            <span className="sfc-source__lineno">{i + 1}</span>
            <span className="sfc-source__linecontent">{line || ' '}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}
