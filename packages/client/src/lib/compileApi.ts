import type { SemanticUIAst, RuleViolation } from '@designbridge/ast';

export interface VueArtifactDTO { filename: string; code: string; }
export interface CompileResultDTO { ast: SemanticUIAst; violations: RuleViolation[]; vue: VueArtifactDTO; }

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error((detail as { error?: string }).error ?? `request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function compile(projectId: string, body: { artifactId: string; requirement: string }): Promise<CompileResultDTO> {
  return postJson(`/api/projects/${projectId}/compile`, body);
}

export function mutate(projectId: string, body: { ast: SemanticUIAst; instruction: string }): Promise<CompileResultDTO> {
  return postJson(`/api/projects/${projectId}/compile/mutate`, body);
}
