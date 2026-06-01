import { useState, useRef, useEffect } from 'react';

interface QualityScore {
  overall: number;
  html: number;
  accessibility: number;
  responsive: number;
  consistency: number;
}

interface Props {
  score: QualityScore | null;
}

const DIMENSIONS: { key: keyof Omit<QualityScore, 'overall'>; label: string }[] = [
  { key: 'html', label: 'HTML' },
  { key: 'accessibility', label: '無障礙' },
  { key: 'responsive', label: '響應式' },
  { key: 'consistency', label: '一致性' },
];

function getColor(score: number): string {
  if (score >= 80) return '#16a34a';
  if (score >= 60) return '#ca8a04';
  return '#dc2626';
}

function getBgColor(score: number): string {
  if (score >= 80) return '#f0fdf4';
  if (score >= 60) return '#fefce8';
  return '#fef2f2';
}

export default function QualityBadge({ score }: Props) {
  const [showPopover, setShowPopover] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPopover) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowPopover(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPopover]);

  if (!score) return null;

  const color = getColor(score.overall);
  const bgColor = getBgColor(score.overall);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setShowPopover(!showPopover)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          padding: '1px 6px',
          borderRadius: '10px',
          border: `1px solid ${color}33`,
          background: bgColor,
          color,
          fontSize: '10px',
          fontWeight: 700,
          cursor: 'pointer',
          lineHeight: '16px',
        }}
        title="品質評分"
      >
        {score.overall}
      </button>

      {showPopover && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginTop: '4px',
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            padding: '10px 12px',
            width: '180px',
            zIndex: 100,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#1e293b', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
            <span>品質評分</span>
            <span style={{ color, fontWeight: 700 }}>{score.overall}/100</span>
          </div>
          {DIMENSIONS.map(({ key, label }) => {
            const val = score[key];
            const dimColor = getColor(val);
            return (
              <div key={key} style={{ marginBottom: '5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b', marginBottom: '2px' }}>
                  <span>{label}</span>
                  <span style={{ color: dimColor, fontWeight: 600 }}>{val}</span>
                </div>
                <div style={{ height: '4px', background: '#f1f5f9', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${val}%`, background: dimColor, borderRadius: '2px', transition: 'width 0.3s ease' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
