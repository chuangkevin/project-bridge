import { useState, useCallback, useRef, useEffect } from 'react';

interface Props {
  bridgeId: string;
  styles: Record<string, string>;
  onStyleChange: (property: string, value: string) => void;
  onClose: () => void;
  position: { x: number; y: number };
}

type SpacingMode = 'unified' | 'individual';

const FONT_WEIGHT_OPTIONS = [
  { value: '400', label: '400 (Normal)' },
  { value: '500', label: '500 (Medium)' },
  { value: '600', label: '600 (Semi-bold)' },
  { value: '700', label: '700 (Bold)' },
];

const UNIT_OPTIONS = ['px', '%'] as const;

function parseNumericValue(val: string): { num: number; unit: string } {
  const match = val.match(/^(-?\d*\.?\d+)(px|%|em|rem|vh|vw)?$/);
  if (match) return { num: parseFloat(match[1]), unit: match[2] || 'px' };
  return { num: 0, unit: 'px' };
}

function parseSpacing(val: string): [string, string, string, string] {
  if (!val) return ['0', '0', '0', '0'];
  const parts = val.trim().split(/\s+/);
  if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]];
  if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]];
  if (parts.length === 3) return [parts[0], parts[1], parts[2], parts[1]];
  return [parts[0], parts[1], parts[2], parts[3]];
}

function ColorRow({ label, property, value, onChange }: {
  label: string;
  property: string;
  value: string;
  onChange: (property: string, value: string) => void;
}) {
  const colorVal = value || '#000000';
  return (
    <div style={s.row}>
      <span style={s.label}>{label}</span>
      <div style={s.control}>
        <input
          type="color"
          value={colorVal.startsWith('#') ? colorVal : '#000000'}
          onChange={e => onChange(property, e.target.value)}
          style={s.colorPicker}
          data-testid={`style-color-${property}`}
        />
        <input
          type="text"
          value={colorVal}
          onChange={e => onChange(property, e.target.value)}
          style={s.hexInput}
          maxLength={25}
          data-testid={`style-hex-${property}`}
        />
      </div>
    </div>
  );
}

function NumberWithUnitRow({ label, property, value, onChange, units }: {
  label: string;
  property: string;
  value: string;
  onChange: (property: string, value: string) => void;
  units?: readonly string[];
}) {
  const { num, unit } = parseNumericValue(value || '0px');
  const availableUnits = units || UNIT_OPTIONS;
  return (
    <div style={s.row}>
      <span style={s.label}>{label}</span>
      <div style={s.control}>
        <input
          type="number"
          value={num}
          onChange={e => onChange(property, `${e.target.value}${unit}`)}
          style={s.numberInput}
          data-testid={`style-num-${property}`}
        />
        {availableUnits.length > 1 ? (
          <select
            value={unit}
            onChange={e => onChange(property, `${num}${e.target.value}`)}
            style={s.unitSelect}
          >
            {availableUnits.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        ) : (
          <span style={s.unitLabel}>{availableUnits[0]}</span>
        )}
      </div>
    </div>
  );
}

function SpacingGroup({ label, property, value, onChange }: {
  label: string;
  property: string;
  value: string;
  onChange: (property: string, value: string) => void;
}) {
  const [mode, setMode] = useState<SpacingMode>('unified');
  const [top, right, bottom, left] = parseSpacing(value);
  const { num: unifiedNum } = parseNumericValue(top);

  const handleUnified = (v: string) => {
    onChange(property, `${v}px`);
  };

  const handleIndividual = (side: number, v: string) => {
    const parts = [top, right, bottom, left];
    parts[side] = `${v}px`;
    onChange(property, parts.join(' '));
  };

  return (
    <div style={s.spacingGroup}>
      <div style={s.spacingHeader}>
        <span style={s.label}>{label}</span>
        <button
          style={s.modeToggle}
          onClick={() => setMode(m => m === 'unified' ? 'individual' : 'unified')}
          title={mode === 'unified' ? '切換為個別設定' : '切換為統一設定'}
        >
          {mode === 'unified' ? '⊞' : '⊟'}
        </button>
      </div>
      {mode === 'unified' ? (
        <div style={s.control}>
          <input
            type="number"
            value={unifiedNum}
            onChange={e => handleUnified(e.target.value)}
            style={s.numberInput}
            data-testid={`style-${property}-unified`}
          />
          <span style={s.unitLabel}>px</span>
        </div>
      ) : (
        <div style={s.spacingGrid}>
          {(['上', '右', '下', '左'] as const).map((dir, i) => (
            <div key={dir} style={s.spacingCell}>
              <span style={s.tinyLabel}>{dir}</span>
              <input
                type="number"
                value={parseNumericValue([top, right, bottom, left][i]).num}
                onChange={e => handleIndividual(i, e.target.value)}
                style={s.smallNumberInput}
                data-testid={`style-${property}-${['top', 'right', 'bottom', 'left'][i]}`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StylePropertyPanel({
  bridgeId,
  styles: currentStyles,
  onStyleChange,
  onClose,
  position,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const toggleSection = useCallback((section: string) => {
    setCollapsed(prev => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const get = (prop: string) => currentStyles[prop] || '';

  return (
    <div
      ref={panelRef}
      style={{
        ...s.panel,
        left: position.x,
        top: position.y,
      }}
      data-testid="style-property-panel"
      data-bridge-id={bridgeId}
    >
      {/* Header */}
      <div style={s.header}>
        <span style={s.headerTitle}>樣式屬性</span>
        <button style={s.closeBtn} onClick={onClose} data-testid="style-panel-close">✕</button>
      </div>

      <div style={s.scrollArea}>
        {/* Colors */}
        <SectionHeader title="顏色" section="colors" collapsed={collapsed} onToggle={toggleSection} />
        {!collapsed.colors && (
          <div style={s.sectionBody}>
            <ColorRow label="背景色" property="backgroundColor" value={get('backgroundColor')} onChange={onStyleChange} />
            <ColorRow label="文字色" property="color" value={get('color')} onChange={onStyleChange} />
            <ColorRow label="邊框色" property="borderColor" value={get('borderColor')} onChange={onStyleChange} />
          </div>
        )}

        {/* Typography */}
        <SectionHeader title="文字排版" section="typography" collapsed={collapsed} onToggle={toggleSection} />
        {!collapsed.typography && (
          <div style={s.sectionBody}>
            <NumberWithUnitRow label="字體大小" property="fontSize" value={get('fontSize')} onChange={onStyleChange} units={['px']} />
            <div style={s.row}>
              <span style={s.label}>字體粗細</span>
              <select
                value={get('fontWeight') || '400'}
                onChange={e => onStyleChange('fontWeight', e.target.value)}
                style={s.selectFull}
                data-testid="style-select-fontWeight"
              >
                {FONT_WEIGHT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div style={s.row}>
              <span style={s.label}>字型</span>
              <input
                type="text"
                value={get('fontFamily')}
                onChange={e => onStyleChange('fontFamily', e.target.value)}
                style={s.textInput}
                placeholder="sans-serif"
                data-testid="style-text-fontFamily"
              />
            </div>
          </div>
        )}

        {/* Spacing */}
        <SectionHeader title="間距" section="spacing" collapsed={collapsed} onToggle={toggleSection} />
        {!collapsed.spacing && (
          <div style={s.sectionBody}>
            <SpacingGroup label="內距" property="padding" value={get('padding')} onChange={onStyleChange} />
            <SpacingGroup label="外距" property="margin" value={get('margin')} onChange={onStyleChange} />
            <NumberWithUnitRow label="圓角" property="borderRadius" value={get('borderRadius')} onChange={onStyleChange} units={['px']} />
          </div>
        )}

        {/* Size */}
        <SectionHeader title="尺寸" section="size" collapsed={collapsed} onToggle={toggleSection} />
        {!collapsed.size && (
          <div style={s.sectionBody}>
            <NumberWithUnitRow label="寬度" property="width" value={get('width')} onChange={onStyleChange} />
            <NumberWithUnitRow label="高度" property="height" value={get('height')} onChange={onStyleChange} />
          </div>
        )}

        {/* Other */}
        <SectionHeader title="其他" section="other" collapsed={collapsed} onToggle={toggleSection} />
        {!collapsed.other && (
          <div style={s.sectionBody}>
            <div style={s.row}>
              <span style={s.label}>透明度</span>
              <div style={s.control}>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={get('opacity') || '1'}
                  onChange={e => onStyleChange('opacity', e.target.value)}
                  style={s.slider}
                  data-testid="style-slider-opacity"
                />
                <span style={s.sliderValue}>{parseFloat(get('opacity') || '1').toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, section, collapsed, onToggle }: {
  title: string;
  section: string;
  collapsed: Record<string, boolean>;
  onToggle: (section: string) => void;
}) {
  return (
    <div
      style={s.sectionHeader}
      onClick={() => onToggle(section)}
      data-testid={`style-section-${section}`}
    >
      <span style={s.sectionArrow}>{collapsed[section] ? '▸' : '▾'}</span>
      <span style={s.sectionTitle}>{title}</span>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  panel: {
    position: 'fixed',
    width: 280,
    maxHeight: '80vh',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 9999,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#e2e8f0',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: '1px solid #334155',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#f1f5f9',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    fontSize: 14,
    cursor: 'pointer',
    padding: '2px 4px',
    lineHeight: 1,
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 0',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    cursor: 'pointer',
    userSelect: 'none',
    borderBottom: '1px solid #334155',
  },
  sectionArrow: {
    fontSize: 10,
    color: '#64748b',
    width: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  sectionBody: {
    padding: '8px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: 500,
    color: '#94a3b8',
    minWidth: 56,
    flexShrink: 0,
  },
  control: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  colorPicker: {
    width: 28,
    height: 24,
    border: '1px solid #475569',
    borderRadius: 4,
    padding: 1,
    cursor: 'pointer',
    backgroundColor: 'transparent',
    flexShrink: 0,
  },
  hexInput: {
    flex: 1,
    padding: '4px 6px',
    border: '1px solid #475569',
    borderRadius: 4,
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#e2e8f0',
    backgroundColor: '#0f172a',
    outline: 'none',
    minWidth: 0,
  },
  numberInput: {
    flex: 1,
    padding: '4px 6px',
    border: '1px solid #475569',
    borderRadius: 4,
    fontSize: 11,
    color: '#e2e8f0',
    backgroundColor: '#0f172a',
    outline: 'none',
    minWidth: 0,
    fontFamily: 'monospace',
  },
  smallNumberInput: {
    width: '100%',
    padding: '3px 4px',
    border: '1px solid #475569',
    borderRadius: 4,
    fontSize: 10,
    color: '#e2e8f0',
    backgroundColor: '#0f172a',
    outline: 'none',
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  unitSelect: {
    padding: '4px 4px',
    border: '1px solid #475569',
    borderRadius: 4,
    fontSize: 11,
    color: '#e2e8f0',
    backgroundColor: '#0f172a',
    outline: 'none',
    cursor: 'pointer',
    flexShrink: 0,
  },
  unitLabel: {
    fontSize: 11,
    color: '#64748b',
    flexShrink: 0,
    minWidth: 20,
  },
  selectFull: {
    flex: 1,
    padding: '4px 6px',
    border: '1px solid #475569',
    borderRadius: 4,
    fontSize: 11,
    color: '#e2e8f0',
    backgroundColor: '#0f172a',
    outline: 'none',
    cursor: 'pointer',
  },
  textInput: {
    flex: 1,
    padding: '4px 6px',
    border: '1px solid #475569',
    borderRadius: 4,
    fontSize: 11,
    color: '#e2e8f0',
    backgroundColor: '#0f172a',
    outline: 'none',
    minWidth: 0,
  },
  slider: {
    flex: 1,
    cursor: 'pointer',
    minWidth: 0,
    accentColor: '#7c3aed',
  },
  sliderValue: {
    fontSize: 11,
    color: '#94a3b8',
    fontFamily: 'monospace',
    minWidth: 32,
    textAlign: 'right',
    flexShrink: 0,
  },
  spacingGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  spacingHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modeToggle: {
    background: 'none',
    border: '1px solid #475569',
    borderRadius: 4,
    color: '#94a3b8',
    fontSize: 12,
    cursor: 'pointer',
    padding: '1px 5px',
    lineHeight: 1,
  },
  spacingGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr 1fr',
    gap: 4,
  },
  spacingCell: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  tinyLabel: {
    fontSize: 9,
    color: '#64748b',
  },
};
