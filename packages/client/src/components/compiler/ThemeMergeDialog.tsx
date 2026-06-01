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
  palette: 'Palette',
  typography: 'Typography',
  radius: 'Radius',
  shadow: 'Shadow',
} as const;

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
        background: 'rgba(0,0,0,.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        style={{
          background: 'var(--bg-secondary, #fff)',
          padding: 16, borderRadius: 8,
          maxWidth: 720, width: '90%',
          maxHeight: '90vh', overflow: 'auto',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Theme update from {proposal.source}</h3>
        {(Object.keys(SECTION_DESCRIPTIONS) as Array<keyof typeof SECTION_DESCRIPTIONS>).map(section => {
          const [choice, setChoice] = setters[section];
          const currentVal = current && typeof current === 'object' ? (current as Record<string, unknown>)[section] : null;
          const proposedVal = proposal[section];
          return (
            <div key={section} style={{ borderBottom: '1px solid var(--border-primary, #e2e8f0)', padding: '8px 0' }}>
              <div style={{ fontWeight: 600 }}>{SECTION_DESCRIPTIONS[section]}</div>
              <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-secondary, #64748b)', marginTop: 4 }}>
                <div><b>Current:</b> {preview(currentVal)}</div>
                <div><b>Proposed:</b> {preview(proposedVal)}</div>
              </div>
              <select
                aria-label={`${section} choice`}
                value={choice}
                onChange={(e) => setChoice(e.target.value as SectionChoice)}
                style={{ marginTop: 4 }}
              >
                <option value="take-new">Take new</option>
                <option value="keep">Keep current</option>
                <option value="union">Union</option>
              </select>
            </div>
          );
        })}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" onClick={() => onApply({ palette, typography, radius, shadow })}>Apply</button>
        </div>
      </div>
    </div>
  );
}
