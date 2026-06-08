interface Props {
  instruction: string;
  onChange: (val: string) => void;
  loading: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

export default function RegenQuickForm({ instruction, onChange, loading, onSubmit, onCancel }: Props) {
  return (
    <div>
      <textarea
        autoFocus
        value={instruction}
        onChange={e => onChange(e.target.value)}
        placeholder="修改指令，例如：把背景改成深藍色…"
        rows={3}
        style={{
          width: '100%',
          padding: '6px 8px',
          borderRadius: 6,
          border: '1px solid var(--border-primary)',
          background: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          fontSize: 12,
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          disabled={loading}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid var(--border-primary)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: 12,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          取消
        </button>
        <button
          onClick={onSubmit}
          disabled={loading || !instruction.trim()}
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
            fontSize: 12,
            cursor: loading || !instruction.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !instruction.trim() ? 0.6 : 1,
          }}
        >
          {loading ? '生成中…' : '重新生成'}
        </button>
      </div>
    </div>
  );
}
