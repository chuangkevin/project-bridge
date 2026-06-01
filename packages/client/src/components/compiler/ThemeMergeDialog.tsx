import { useState } from 'react';

export interface ThemeProposalDto {
  palette: Array<{ value: string; source?: string }>;
  typography: { primaryFont: string | null; secondaryFont: string | null; headings: Array<{ tag: string; fontSize: string; fontWeight: string }>; body: { fontFamily: string; fontSize: string; lineHeight?: string } | null };
  radius: string[];
  shadow: string[];
  source: string;
}

export type SectionChoice = 'take-new' | 'keep' | 'union';
export type ThemeMergeChoice = Record<'palette' | 'typography' | 'radius' | 'shadow', SectionChoice>;

export interface ThemeMergeDialogProps {
  current: unknown;
  proposal: ThemeProposalDto;
  onApply: (choice: ThemeMergeChoice) => void;
  onCancel: () => void;
}

const SECTION_DESCRIPTIONS = {
  palette: '色票',
  typography: '字體',
  radius: '圓角',
  shadow: '陰影',
} as const;

const CHOICE_LABELS: Record<SectionChoice, string> = {
  'take-new': '採用新值',
  'keep': '保留現有',
  'union': '合併',
};

function preview(value: unknown): string {
  const s = JSON.stringify(value);
  return s.length > 100 ? `${s.slice(0, 100)}…` : s;
}

export default function ThemeMergeDialog({ current, proposal, onApply, onCancel }: ThemeMergeDialogProps): JSX.Element {
  const [palette, setPalette] = useState<SectionChoice>('take-new');
  const [typography, setTypography] = useState<SectionChoice>('take-new');
  const [radius, setRadius] = useState<SectionChoice>('take-new');
  const [shadow, setShadow] = useState<SectionChoice>('take-new');

  const setters: Record<keyof typeof SECTION_DESCRIPTIONS, [SectionChoice, (s: SectionChoice) => void]> = {
    palette: [palette, setPalette],
    typography: [typography, setTypography],
    radius: [radius, setRadius],
    shadow: [shadow, setShadow],
  };

  return (
    <div
      role="dialog"
      data-testid="theme-merge-dialog"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,.55)',
        backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          padding: 20,
          borderRadius: 14,
          maxWidth: 720,
          width: '92%',
          maxHeight: '88vh',
          overflow: 'auto',
          border: '1px solid var(--border-accent)',
          boxShadow: 'var(--shadow-lg)',
          color: 'var(--text-primary)',
        }}
      >
        <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>套用設計主題</h3>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          來源：{proposal.source}
        </div>
        {(Object.keys(SECTION_DESCRIPTIONS) as Array<keyof typeof SECTION_DESCRIPTIONS>).map(section => {
          const [choice, setChoice] = setters[section];
          const currentVal = current && typeof current === 'object' ? (current as Record<string, unknown>)[section] : null;
          const proposedVal = proposal[section];
          return (
            <div key={section} style={{ borderBottom: '1px solid var(--border-subtle)', padding: '12px 0' }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{SECTION_DESCRIPTIONS[section]}</div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, flexWrap: 'wrap' }}>
                <div><b style={{ color: 'var(--text-muted)' }}>現有：</b> {preview(currentVal)}</div>
                <div><b style={{ color: 'var(--text-muted)' }}>提案：</b> {preview(proposedVal)}</div>
              </div>
              <select
                aria-label={`${section} choice`}
                value={choice}
                onChange={(e) => setChoice(e.target.value as SectionChoice)}
                style={{
                  marginTop: 4,
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--border-primary)',
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                }}
              >
                <option value="take-new">{CHOICE_LABELS['take-new']}</option>
                <option value="keep">{CHOICE_LABELS['keep']}</option>
                <option value="union">{CHOICE_LABELS['union']}</option>
              </select>
            </div>
          );
        })}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid var(--border-primary)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onApply({ palette, typography, radius, shadow })}
            aria-label="Apply"
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              background: 'linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            套用
          </button>
        </div>
      </div>
    </div>
  );
}
