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
