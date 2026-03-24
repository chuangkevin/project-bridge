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
      // Fetch prototype HTML and pages
      const res = await fetch(`/api/projects/${projectId}/prototype`);
      if (!res.ok) return;
      const data = await res.json();
      let pageNames: string[] = data.pages || [];
      if (pageNames.length === 0) {
        pageNames = ['主頁面'];
      }

      // Try AI analysis of HTML to extract navigation links
      let edges: { id: string; source: string; target: string }[] = [];
      if (data.html && pageNames.length > 1) {
        try {
          const analyzeRes = await fetch(`/api/projects/${projectId}/architecture/analyze-html`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html: data.html, pages: pageNames }),
          });
          if (analyzeRes.ok) {
            const analysis = await analyzeRes.json();
            edges = analysis.edges || [];
          }
        } catch { /* fallback: no edges */ }
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

      const newArchData: ArchData = {
        type: 'page',
        subtype: 'website',
        aiDecidePages: false,
        nodes,
        edges,
      };
      await patchArchData(projectId, newArchData);
      setArchData(newArchData);
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
        extraToolbar={
          <button
            type="button"
            onClick={handleImportFromPrototype}
            disabled={importing}
            style={{ background: 'none', border: '1px solid #C4A8DC', borderRadius: 8, color: '#8E6FA7', fontSize: 12, padding: '5px 12px', cursor: importing ? 'default' : 'pointer', opacity: importing ? 0.6 : 1 }}
          >
            {importing ? '分析中...' : '⬆ 從設計重新產生架構'}
          </button>
        }
      />
    </div>
  );
}
