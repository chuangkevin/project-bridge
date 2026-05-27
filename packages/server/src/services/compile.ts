import {
  applySkillRules, CORE_RULES,
  type SemanticUIAst, type RuleViolation, type SkillRule,
} from '@designbridge/ast';
import { renderVue, type VueArtifact } from '@designbridge/codegen';
import { buildColdStart, applyMutation, type GenerateFn } from '../semantic';
import { parseInput, type RawInput } from '../ingestion';

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
}

/** Cold start: raw input → IngestionAst → AI AST → skill check → Vue. */
export async function compileFromInput(input: RawInput, options: CompileOptions): Promise<CompileResult> {
  const ingestion = await parseInput(input);
  const ast = await buildColdStart(ingestion, {
    artifactId: options.artifactId,
    generate: options.generate,
    maxRepairs: options.maxRepairs,
    model: options.model,
  });
  return finish(ast, options.rules);
}

export interface MutationOptions {
  generate?: GenerateFn;
  rules?: SkillRule[];
  maxRepairs?: number;
  model?: string;
}

/** Iterative edit: existing AST + NL instruction → AI ops → skill check → Vue. */
export async function compileMutation(ast: SemanticUIAst, instruction: string, options: MutationOptions = {}): Promise<CompileResult> {
  const next = await applyMutation(ast, instruction, {
    generate: options.generate,
    maxRepairs: options.maxRepairs,
    model: options.model,
  });
  return finish(next, options.rules);
}

/** Shared tail: skill-engine assert pass (M1 = no mutation) + Vue codegen. */
function finish(ast: SemanticUIAst, rules?: SkillRule[]): CompileResult {
  const { violations } = applySkillRules(ast, rules ?? CORE_RULES);
  const vue = renderVue(ast);
  return { ast, violations, vue };
}
