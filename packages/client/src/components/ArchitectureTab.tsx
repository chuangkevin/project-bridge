import { useArchStore, ArchData } from '../stores/useArchStore';
import ArchWizard from './ArchWizard';
import ArchFlowchart from './ArchFlowchart';

interface Props {
  projectId: string;
  onSwitchToDesign: () => void;
  onSwitchToDesignAndGenerate?: () => void;
}

export default function ArchitectureTab({ projectId, onSwitchToDesign, onSwitchToDesignAndGenerate }: Props) {
  const { archData, setArchData } = useArchStore();

  const handleWizardComplete = (data: ArchData) => {
    setArchData(data);
  };

  const containerStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: '#FAF4EB',
  };

  const centeredStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  if (!archData) {
    return (
      <div style={containerStyle}>
        <style>{`
          @keyframes slideIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #E8DFD0' }}>
          <button
            type="button"
            onClick={onSwitchToDesign}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8E6FA7', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M10 12L6 8l4-4" />
            </svg>
            返回設計
          </button>
        </div>
        <div style={centeredStyle} data-testid="arch-wizard">
          <ArchWizard projectId={projectId} onComplete={handleWizardComplete} onSkip={onSwitchToDesign} />
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <ArchFlowchart
        projectId={projectId}
        onSwitchToDesign={onSwitchToDesign}
        onGenerate={onSwitchToDesignAndGenerate}
      />
    </div>
  );
}
