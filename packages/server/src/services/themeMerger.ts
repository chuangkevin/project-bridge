import type {
  ThemeProposal,
  ThemeProposalPalette,
  ThemeProposalHeading,
  ThemeProposalBody,
} from './themeExtractor';

export interface ThemeFile {
  schemaVersion: 1;
  updatedAt: string;
  palette: ThemeProposalPalette[];
  typography: {
    primaryFont: string | null;
    secondaryFont: string | null;
    headings: ThemeProposalHeading[];
    body: ThemeProposalBody | null;
  };
  radius: string[];
  shadow: string[];
}

export type Section = 'palette' | 'typography' | 'radius' | 'shadow';
export type SectionChoice = 'take-new' | 'keep' | 'union';
export type ThemeMergeChoice = Record<Section, SectionChoice>;

function dedupBy<T>(arr: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    const k = key(x);
    if (!seen.has(k)) { seen.add(k); out.push(x); }
  }
  return out;
}

export function mergeTheme(current: ThemeFile | null, proposal: ThemeProposal, choice: ThemeMergeChoice): ThemeFile {
  const cur: ThemeFile = current ?? {
    schemaVersion: 1,
    updatedAt: '',
    palette: [],
    typography: { primaryFont: null, secondaryFont: null, headings: [], body: null },
    radius: [],
    shadow: [],
  };

  const palette =
    choice.palette === 'keep' ? cur.palette
    : choice.palette === 'take-new' ? proposal.palette
    : dedupBy([...cur.palette, ...proposal.palette], p => p.value);

  const typography =
    choice.typography === 'keep' ? cur.typography
    : choice.typography === 'take-new' ? proposal.typography
    : {
        primaryFont: cur.typography.primaryFont ?? proposal.typography.primaryFont,
        secondaryFont: cur.typography.secondaryFont ?? proposal.typography.secondaryFont,
        headings: dedupBy([...cur.typography.headings, ...proposal.typography.headings], h => h.tag),
        body: cur.typography.body ?? proposal.typography.body,
      };

  const radius =
    choice.radius === 'keep' ? cur.radius
    : choice.radius === 'take-new' ? proposal.radius
    : [...new Set([...cur.radius, ...proposal.radius])];

  const shadow =
    choice.shadow === 'keep' ? cur.shadow
    : choice.shadow === 'take-new' ? proposal.shadow
    : [...new Set([...cur.shadow, ...proposal.shadow])];

  return { schemaVersion: 1, updatedAt: new Date().toISOString(), palette, typography, radius, shadow };
}
