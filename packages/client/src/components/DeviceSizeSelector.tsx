export type DeviceSize = 'desktop' | 'tablet' | 'mobile';

interface Props {
  value: DeviceSize;
  onChange: (size: DeviceSize) => void;
}

const devices: { key: DeviceSize; label: string; icon: JSX.Element }[] = [
  {
    key: 'desktop',
    label: '桌面版',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
        <rect x="1" y="2" width="14" height="10" rx="1.5" />
        <line x1="5" y1="14" x2="11" y2="14" />
        <line x1="8" y1="12" x2="8" y2="14" />
      </svg>
    ),
  },
  {
    key: 'tablet',
    label: '平板',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
        <rect x="2" y="1" width="12" height="14" rx="1.5" />
        <circle cx="8" cy="13" r="0.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    key: 'mobile',
    label: '手機版',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
        <rect x="4" y="1" width="8" height="14" rx="1.5" />
        <circle cx="8" cy="13" r="0.5" fill="currentColor" />
      </svg>
    ),
  },
];

export default function DeviceSizeSelector({ value, onChange }: Props) {
  return (
    <div style={styles.group}>
      {devices.map(d => (
        <button
          key={d.key}
          style={{
            ...styles.btn,
            ...(value === d.key ? styles.activeBtn : {}),
          }}
          onClick={() => onChange(d.key)}
          title={d.label}
          data-testid={`device-${d.key}`}
        >
          {d.icon}
          <span style={styles.label}>{d.label}</span>
        </button>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  group: {
    display: 'flex',
    gap: '2px',
    backgroundColor: '#f1f5f9',
    borderRadius: '8px',
    padding: '2px',
  },
  btn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 10px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: '#64748b',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  activeBtn: {
    backgroundColor: '#ffffff',
    color: '#3b82f6',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  label: {
    fontSize: '12px',
  },
};
