interface Props {
  projectId: string;
  onSwitchToDesign: () => void;
}

export default function ArchFlowchart({ projectId: _projectId, onSwitchToDesign }: Props) {
  return (
    <div data-testid="arch-flowchart" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F8F7F5' }}>
      <p style={{ color: '#8C8C8C', fontSize: 14 }}>架構圖 — Flowchart</p>
      <button onClick={onSwitchToDesign} style={{ marginTop: 16, padding: '8px 20px', background: '#8E6FA7', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
        開始生成 ▶
      </button>
    </div>
  );
}
