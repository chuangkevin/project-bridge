import type { Artifact } from '../../../hooks/useArtifacts';

interface Props {
  artifacts: Artifact[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function ArtifactPicker({ artifacts, selectedId, onSelect }: Props) {
  if (artifacts.length === 0) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>還沒有頁面</div>;
  }
  return (
    <select
      className="artifact-picker"
      value={selectedId ?? ''}
      onChange={(e) => onSelect(e.target.value)}
    >
      {artifacts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name} · {new Date(a.createdAt).toLocaleString('zh-TW')}
        </option>
      ))}
    </select>
  );
}
