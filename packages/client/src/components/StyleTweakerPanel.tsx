import { useState, useEffect, useCallback } from 'react';
import { extractStyleTokens, buildCssOverride, StyleToken } from '../utils/cssExtractor';
import Toast from './Toast';

interface Props {
  html: string | null;
  onInject: (css: string) => void;
  onSave: (css: string) => Promise<void>;
}

const FONT_OPTIONS = [
  { value: 'system-ui, -apple-system, sans-serif', label: 'System' },
  { value: 'sans-serif', label: 'Sans-serif' },
  { value: 'serif', label: 'Serif' },
  { value: 'monospace', label: 'Monospace' },
];

export default function StyleTweakerPanel({ html, onInject, onSave }: Props) {
  const [tokens, setTokens] = useState<StyleToken[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 2500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // Re-extract tokens and reset overrides whenever html changes
  useEffect(() => {
    if (!html) { setTokens([]); setOverrides({}); return; }
    const extracted = extractStyleTokens(html);
    setTokens(extracted);
    const initial: Record<string, string> = {};
    extracted.forEach(t => { initial[t.name] = t.value; });
    setOverrides(initial);
  }, [html]);

  const handleChange = useCallback((name: string, value: string) => {
    setOverrides(prev => {
      const next = { ...prev, [name]: value };
      onInject(buildCssOverride(next));
      return next;
    });
  }, [onInject]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await onSave(buildCssOverride(overrides));
      setToastMsg('樣式已儲存');
    } catch {
      setToastMsg('儲存失敗');
    } finally {
      setSaving(false);
    }
  }, [onSave, overrides]);

  if (!html) {
    return (
      <div style={styles.emptyState}>
        <p style={styles.emptyText}>尚未生成原型，請先透過 Chat 生成畫面</p>
      </div>
    );
  }

  if (tokens.length === 0) {
    return (
      <div style={styles.emptyState}>
        <p style={styles.emptyText}>此原型無偵測到可調整的樣式變數</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.scrollArea}>
        {tokens.map(token => (
          <div key={token.name} style={styles.row}>
            <span style={styles.label} title={token.name}>{token.label}</span>
            <div style={styles.control}>
              {token.type === 'color' && (
                <>
                  <input
                    type="color"
                    value={overrides[token.name] || token.value}
                    onChange={e => handleChange(token.name, e.target.value)}
                    style={styles.colorPicker}
                    data-testid={`tweaker-color-${token.name}`}
                  />
                  <input
                    type="text"
                    value={overrides[token.name] || token.value}
                    onChange={e => handleChange(token.name, e.target.value)}
                    style={styles.hexInput}
                    maxLength={25}
                  />
                </>
              )}
              {token.type === 'size' && (
                <>
                  <input
                    type="range"
                    min={token.min ?? 0}
                    max={token.max ?? 64}
                    value={parseInt(overrides[token.name] || token.value, 10) || 0}
                    onChange={e => handleChange(token.name, `${e.target.value}px`)}
                    style={styles.slider}
                    data-testid={`tweaker-size-${token.name}`}
                  />
                  <span style={styles.sizeLabel}>{overrides[token.name] || token.value}</span>
                </>
              )}
              {token.type === 'font' && (
                <select
                  value={overrides[token.name] || token.value}
                  onChange={e => handleChange(token.name, e.target.value)}
                  style={styles.select}
                  data-testid={`tweaker-font-${token.name}`}
                >
                  {FONT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                  {/* Keep original if not in list */}
                  {!FONT_OPTIONS.find(o => o.value === (overrides[token.name] || token.value)) && (
                    <option value={overrides[token.name] || token.value}>
                      {overrides[token.name] || token.value}
                    </option>
                  )}
                </select>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={styles.footer}>
        <p style={styles.hint}>重新生成將重置樣式微調</p>
        <button
          style={{ ...styles.saveBtn, opacity: saving ? 0.7 : 1 }}
          onClick={handleSave}
          disabled={saving}
          data-testid="save-styles-btn"
        >
          {saving ? '儲存中...' : '儲存樣式'}
        </button>
      </div>

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  scrollArea: { flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' },
  row: { display: 'flex', alignItems: 'center', gap: '10px' },
  label: { fontSize: '12px', fontWeight: 500, color: '#475569', minWidth: '72px', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  control: { display: 'flex', alignItems: 'center', gap: '6px', flex: 1 },
  colorPicker: { width: '30px', height: '26px', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '2px', cursor: 'pointer', backgroundColor: '#fff', flexShrink: 0 },
  hexInput: { flex: 1, padding: '4px 7px', border: '1px solid #e2e8f0', borderRadius: '5px', fontSize: '11px', outline: 'none', fontFamily: 'monospace', color: '#1e293b', minWidth: 0 },
  slider: { flex: 1, cursor: 'pointer', minWidth: 0 },
  sizeLabel: { fontSize: '11px', color: '#475569', minWidth: '36px', textAlign: 'right', flexShrink: 0 },
  select: { flex: 1, padding: '4px 7px', border: '1px solid #e2e8f0', borderRadius: '5px', fontSize: '12px', color: '#1e293b', backgroundColor: '#fff', outline: 'none' },
  footer: { padding: '12px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '6px' },
  hint: { margin: 0, fontSize: '11px', color: '#94a3b8', textAlign: 'center' },
  saveBtn: { width: '100%', padding: '8px', backgroundColor: '#7c3aed', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  emptyState: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '24px' },
  emptyText: { fontSize: '13px', color: '#94a3b8', textAlign: 'center', lineHeight: '1.5' },
};
