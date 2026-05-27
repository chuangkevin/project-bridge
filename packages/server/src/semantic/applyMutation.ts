import {
  validateAst, applyMutationOps, BASE_COMPONENTS,
  type SemanticUIAst, type MutationOp, type ComponentRegistry,
} from '@designbridge/ast';
import { extractJsonBody } from '../services/provider';
import { defaultGenerate, type GenerateFn } from './generate';
import { runRepairLoop } from './repairLoop';
import { buildMutationPrompt } from './prompts';

export interface ApplyMutationOptions {
  registry?: ComponentRegistry;
  generate?: GenerateFn;
  maxRepairs?: number;
  model?: string;
}

/** Iterative edit: (AST + NL instruction) → AI MutationOp[] → apply via primitives → validate (bounded repair). */
export async function applyMutation(ast: SemanticUIAst, instruction: string, options: ApplyMutationOptions = {}): Promise<SemanticUIAst> {
  const registry = options.registry ?? BASE_COMPONENTS;
  const generate = options.generate ?? defaultGenerate;
  const { systemInstruction, prompt } = buildMutationPrompt({ ast, instruction, registry });

  return runRepairLoop<SemanticUIAst>({
    generate, systemInstruction, initialPrompt: prompt, maxRepairs: options.maxRepairs, model: options.model,
    parseAndValidate: (raw) => {
      const parsed = JSON.parse(extractJsonBody(raw)) as { ops?: MutationOp[] };
      const ops = parsed.ops ?? [];
      const next = applyMutationOps(ast, ops);   // may throw on bad op → caught as invalid by repair loop
      const result = validateAst(next, { registry });
      if (result.valid) return { valid: true, value: next };
      return { valid: false, errors: result.errors.map(e => `${e.path}: ${e.message}`) };
    },
  });
}
