import {
  applySkillRules, CORE_RULES,
  type IngestionAst, type SemanticUIAst, type RuleViolation, type SkillRule,
} from '@designbridge/ast';
import { renderVue, type VueArtifact } from '@designbridge/codegen';
import { buildColdStart, applyMutation, type GenerateFn } from '../semantic';
import { parseInput, type RawInput } from '../ingestion';
import { saveArtifact } from '../storage/artifactStore';

export interface CompileResult {
  ast: SemanticUIAst;
  violations: RuleViolation[];
  vue: VueArtifact;
}

export interface CompileOptions {
  artifactId: string;
  generate?: GenerateFn;
  rules?: SkillRule[];
  maxRepairs?: number;
  model?: string;
  /** When set, the final AST is persisted under this project (opt-in). */
  projectId?: string;
}

/** Cold start: raw input → IngestionAst → AI AST → skill check → Vue. */
export async function compileFromInput(input: RawInput, options: CompileOptions): Promise<CompileResult> {
  const ingestion = await parseInput(input);
  return compileFromIngestion(ingestion, options);
}

/** Same as compileFromInput, but takes a pre-built ingestion (e.g. WebpageIngestion from parseWebpage). */
export async function compileFromIngestion(ingestion: IngestionAst, options: CompileOptions): Promise<CompileResult> {
  const ast = await buildColdStart(ingestion, {
    artifactId: options.artifactId,
    generate: options.generate,
    maxRepairs: options.maxRepairs,
    model: options.model,
  });
  const result = finish(ast, options.rules);
  if (options.projectId) saveArtifact(options.projectId, result.ast);
  return result;
}

export interface MutationOptions {
  generate?: GenerateFn;
  rules?: SkillRule[];
  maxRepairs?: number;
  model?: string;
  /** When set, the final AST is persisted under this project (opt-in). */
  projectId?: string;
}

/** Iterative edit: existing AST + NL instruction → AI ops → skill check → Vue. */
export async function compileMutation(ast: SemanticUIAst, instruction: string, options: MutationOptions = {}): Promise<CompileResult> {
  const next = await applyMutation(ast, instruction, {
    generate: options.generate,
    maxRepairs: options.maxRepairs,
    model: options.model,
  });
  const result = finish(next, options.rules);
  if (options.projectId) saveArtifact(options.projectId, result.ast);
  return result;
}

/** Shared tail: skill-engine assert pass (M1 = no mutation) + Vue codegen. */
function finish(ast: SemanticUIAst, rules?: SkillRule[]): CompileResult {
  const { violations } = applySkillRules(ast, rules ?? CORE_RULES);
  const vue = renderVue(ast);
  return { ast, violations, vue };
}
