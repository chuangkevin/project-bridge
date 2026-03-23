import { useState } from 'react';
import { useArchStore, ArchData } from '../stores/useArchStore';
import ArchWizard from './ArchWizard';
import ArchFlowchart from './ArchFlowchart';

interface Props {
  projectId: string;
  onSwitchToDesign: () => void;
  onSwitchToDesignAndGenerate?: () => void;
}

export default function ArchitectureTab({ projectId, onSwitchToDesign, onSwitchToDesignAndGenerate }: Props) {
  const { archData, setArchData, patchArchData } = useArchStore();
  const [importing, setImporting] = useState(false);

  const handleWizardComplete = (data: ArchData) => {
    setArchData(data);
  };

  const handleImportFromPrototype = async () => {
    setImporting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/prototype`);
      if (!res.ok) return;
      const data = await res.json();
      let pageNames: string[] = data.pages || [];
      if (pageNames.length === 0) {
        // Single-page prototype — create one node named "主頁面"
        pageNames = ['主頁面'];
      }

      const nodes = pageNames.map((name, i) => ({
        id: `page-imported-${i}`,
        nodeType: 'page' as const,
        name,
        position: { x: 80 + (i % 3) * 260, y: 80 + Math.floor(i / 3) * 200 },
        referenceFileId: null,
        referenceFileUrl: null,
        viewport: null,
        states: [],
        components: [],
      }));

      const archData: ArchData = {
        type: 'page',
        subtype: 'website',
        aiDecidePages: false,
        nodes,
        edges: [],
      };
      await patchArchData(projectId, archData);
      setArchData(archData);
    } catch (err) {
      console.error('Failed to import from prototype:', err);
    } finally {
      setImporting(false);
    }
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
        <div style={{ ...centeredStyle, flexDirection: 'column', gap: 16 }}>
          <ArchWizard projectId={projectId} onComplete={handleWizardComplete} onSkip={onSwitchToDesign} />
          <button
            type="button"
            onClick={handleImportFromPrototype}
            disabled={importing}
            style={{ background: 'none', border: '1px solid #C4A8DC', borderRadius: 8, color: '#8E6FA7', fontSize: 13, padding: '7px 18px', cursor: importing ? 'default' : 'pointer', opacity: importing ? 0.6 : 1 }}
            data-testid="import-from-prototype-btn"
          >
            {importing ? '匯入中...' : '⬆ 從現有原型匯入頁面'}
          </button>
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
