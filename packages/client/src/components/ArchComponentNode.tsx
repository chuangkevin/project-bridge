import { Handle, Position } from '@xyflow/react';
import './ArchFlowchart.css';

interface ArchComponentNodeData {
  name: string;
  states: string[];
}

export default function ArchComponentNode({ id: _id, data }: { id: string; data: ArchComponentNodeData }) {
  return (
    <div
      data-testid={`component-node-${data.name}`}
      className="arch-component-node"
    >
      <Handle type="target" position={Position.Left} />
      <p className="arch-component-node__name">⬡ {data.name}</p>
      {data.states && data.states.length > 0 && (
        <p className="arch-component-node__states">states: {data.states.join(', ')}</p>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
