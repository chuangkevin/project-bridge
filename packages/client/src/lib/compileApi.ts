import type { SemanticUIAst, RuleViolation } from '@designbridge/ast';

export interface VueArtifactDTO { filename: string; code: string; }
export interface CompileAstResult { ast: SemanticUIAst; violations: RuleViolation[]; vue: VueArtifactDTO; }

export interface MirrorArtifactDTO {
  kind: 'mirror';
  id: string;
  sourceUrl: string;
  sourceType: 'url' | 'screenshot';
  crawledAt: string;
  files: { html: string; css: string; screenshot: string };
  warnings: Array<{ code: string; url?: string; detail?: string }>;
  editable: false;
}

export interface CompileMirrorOkResult { ok: true; artifact: MirrorArtifactDTO; }
export interface CompileMirrorFailResult { ok: false; reason: string; detail?: string; }
export type CompileMirrorResult = CompileMirrorOkResult | CompileMirrorFailResult;

export interface ArtifactListEntry {
  id: string;
  kind: 'ast' | 'mirror';
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error((detail as { error?: string }).error ?? `request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error((detail as { error?: string }).error ?? `request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function compile(projectId: string, body: { artifactId: string; requirement: string }): Promise<CompileAstResult> {
  return postJson(`/api/projects/${projectId}/compile`, body);
}

export function compileMirror(projectId: string, payload: { artifactId?: string; url: string }): Promise<CompileMirrorResult> {
  return postJson(`/api/projects/${projectId}/compile`, {
    mode: 'mirror',
    source: { kind: 'url', payload: payload.url },
    artifactId: payload.artifactId,
  });
}

export function compileMirrorFromImage(projectId: string, payload: { artifactId?: string; mimeType: string; base64: string }): Promise<CompileMirrorResult> {
  return postJson(`/api/projects/${projectId}/compile`, {
    mode: 'mirror',
    source: { kind: 'image', mimeType: payload.mimeType, base64: payload.base64 },
    artifactId: payload.artifactId,
  });
}

export function mutate(projectId: string, body: { ast: SemanticUIAst; instruction: string }): Promise<CompileAstResult> {
  return postJson(`/api/projects/${projectId}/compile/mutate`, body);
}

export function listProjectArtifacts(projectId: string): Promise<{ artifacts: ArtifactListEntry[] }> {
  return getJson(`/api/projects/${projectId}/artifacts`);
}

export function loadProjectArtifact(
  projectId: string,
  artifactId: string,
): Promise<
  | { kind: 'ast'; ast: SemanticUIAst }
  | { kind: 'mirror'; mirror: MirrorArtifactDTO }
> {
  return getJson(`/api/projects/${projectId}/artifacts/${encodeURIComponent(artifactId)}`);
}

export function getMirrorUrl(
  projectId: string,
  artifactId: string,
  file: 'page.html' | 'styles.css' | 'screenshot.png' = 'page.html',
): string {
  return `/api/projects/${encodeURIComponent(projectId)}/mirrors/${encodeURIComponent(artifactId)}/${file}`;
}

export interface ThemeProposalDto {
  palette: Array<{ value: string; source?: string }>;
  typography: {
    primaryFont: string | null;
    secondaryFont: string | null;
    headings: Array<{ tag: string; fontSize: string; fontWeight: string }>;
    body: { fontFamily: string; fontSize: string; lineHeight?: string } | null;
  };
  radius: string[];
  shadow: string[];
  source: string;
}

export interface CompileAstFromUrlOkResult {
  ok: true;
  ast: SemanticUIAst;
  violations: RuleViolation[];
  vue: VueArtifactDTO;
  themeProposal: ThemeProposalDto;
}
export interface CompileFailResult { ok: false; reason: string; detail?: string; }
export type CompileAstFromUrlResult = CompileAstFromUrlOkResult | CompileFailResult;

export function compileAstFromUrl(
  projectId: string,
  payload: { artifactId?: string; url: string },
): Promise<CompileAstFromUrlResult> {
  return postJson(`/api/projects/${projectId}/compile`, {
    mode: 'ast',
    source: { kind: 'url', payload: payload.url },
    artifactId: payload.artifactId,
  });
}

export interface CompileAstFromImageOkResult {
  ok: true;
  ast: SemanticUIAst;
  violations: RuleViolation[];
  vue: VueArtifactDTO;
}
export type CompileAstFromImageResult = CompileAstFromImageOkResult | CompileFailResult;

export function compileAstFromImage(
  projectId: string,
  payload: { artifactId?: string; mimeType: string; base64: string },
): Promise<CompileAstFromImageResult> {
  return postJson(`/api/projects/${projectId}/compile`, {
    mode: 'ast',
    source: { kind: 'image', mimeType: payload.mimeType, base64: payload.base64 },
    artifactId: payload.artifactId,
  });
}

export function upgradeMirrorToAst(
  projectId: string,
  mirrorId: string,
  payload: { artifactId?: string } = {},
): Promise<CompileAstFromUrlResult> {
  return postJson(`/api/projects/${projectId}/mirrors/${mirrorId}/upgrade-to-ast`, payload);
}

export interface ThemeFile {
  schemaVersion: 1;
  updatedAt: string;
  palette: Array<{ value: string; source?: string }>;
  typography: ThemeProposalDto['typography'];
  radius: string[];
  shadow: string[];
}

export type SectionChoice = 'take-new' | 'keep' | 'union';
export type ThemeMergeChoice = Record<'palette' | 'typography' | 'radius' | 'shadow', SectionChoice>;

export function getTheme(projectId: string): Promise<{ theme: ThemeFile | null }> {
  return getJson(`/api/projects/${projectId}/theme`);
}

export function applyThemeMerge(
  projectId: string,
  proposal: ThemeProposalDto,
  choice: ThemeMergeChoice,
): Promise<{ ok: boolean; theme: ThemeFile }> {
  return postJson(`/api/projects/${projectId}/theme/merge`, { proposal, choice });
}
