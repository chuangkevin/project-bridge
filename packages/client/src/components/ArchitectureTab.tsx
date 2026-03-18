import { useArchStore, ArchData } from '../stores/useArchStore';
import ArchWizard from './ArchWizard';
import ArchFlowchart from './ArchFlowchart';

interface Props {
  projectId: string;
  onSwitchToDesign: () => void;
  onSwitchToDesignAndGenerate?: () => void;
}

export default function ArchitectureTab({ projectId, onSwitchToDesign, onSwitchToDesignAndGenerate: _onSwitchToDesignAndGenerate }: Props) {
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
        <div style={centeredStyle} data-testid="arch-wizard">
          <ArchWizard projectId={projectId} onComplete={handleWizardComplete} />
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <ArchFlowchart
        projectId={projectId}
        onSwitchToDesign={onSwitchToDesign}
      />
    </div>
  );
}
