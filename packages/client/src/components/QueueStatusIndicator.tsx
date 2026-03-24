import { useState, useEffect, useRef } from 'react';

interface QueueStatus {
  pending: number;
  processing: number;
  maxConcurrent: number;
  avgMs: number;
}

const POLL_INTERVAL = 10_000; // 10 seconds

export default function QueueStatusIndicator() {
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/queue/status');
        if (res.ok) {
          setStatus(await res.json());
        }
      } catch {
        // Silently ignore fetch errors
      }
    };

    fetchStatus();
    timerRef.current = setInterval(fetchStatus, POLL_INTERVAL);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  if (!status) return null;

  let label: string;
  let dotColor: string;

  if (status.pending > 0) {
    label = `排隊中 (${status.pending} 等待)`;
    dotColor = '#ef4444'; // red
  } else if (status.processing > 0) {
    label = `${status.processing} 個生成中`;
    dotColor = '#f59e0b'; // amber
  } else {
    label = '空閒';
    dotColor = '#22c55e'; // green
  }

  return (
    <div style={styles.container} title={`並行上限: ${status.maxConcurrent} | 平均生成: ${Math.round(status.avgMs / 1000)}s`}>
      <span style={{ ...styles.dot, backgroundColor: dotColor }} />
      <span style={styles.label}>{label}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '2px 10px',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    fontSize: 12,
    cursor: 'default',
    userSelect: 'none',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  label: {
    color: '#ccc',
    whiteSpace: 'nowrap',
  },
};
