import { useArchStore } from '../stores/useArchStore';

interface Props {
  projectId: string;
  onSwitchToDesign: () => void;
  onSwitchToDesignAndGenerate?: () => void;
}

export default function ArchitectureTab({ projectId, onSwitchToDesign, onSwitchToDesignAndGenerate: _onSwitchToDesignAndGenerate }: Props) {
  const { archData } = useArchStore();
  return (
    <div
      data-testid="arch-wizard"
      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAF4EB', flexDirection: 'column', gap: 16 }}
    >
      <p style={{ fontSize: 18, color: '#5B3977', fontWeight: 600 }}>Architecture Mode</p>
      <p style={{ color: '#8C8C8C', fontSize: 14 }}>projectId: {projectId} | archData: {archData ? 'loaded' : 'none'}</p>
      <button onClick={onSwitchToDesign} style={{ padding: '8px 20px', background: '#8E6FA7', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
        Back to Design
      </button>
    </div>
  );
}
