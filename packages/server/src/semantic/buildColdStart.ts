import {
  validateAst, BASE_COMPONENTS,
  type IngestionAst, type SemanticUIAst, type ComponentRegistry,
} from '@designbridge/ast';
import { extractJsonBody } from '../services/provider';
import { defaultGenerate, type GenerateFn } from './generate';
import { runRepairLoop } from './repairLoop';
import { buildColdStartPrompt } from './prompts';

export interface BuildColdStartOptions {
  artifactId: string;
  kind?: SemanticUIAst['kind'];
  registry?: ComponentRegistry;
  generate?: GenerateFn;
  maxRepairs?: number;
  model?: string;
}

/** Cold start: IngestionAst → AI → full validated Semantic UI AST (bounded repair). */
export async function buildColdStart(ingestion: IngestionAst, options: BuildColdStartOptions): Promise<SemanticUIAst> {
  const registry = options.registry ?? BASE_COMPONENTS;
  const kind = options.kind ?? 'page';
  const generate = options.generate ?? defaultGenerate;
  const { systemInstruction, prompt } = buildColdStartPrompt({ ingestion, registry, artifactId: options.artifactId, kind });

  return runRepairLoop<SemanticUIAst>({
    generate, systemInstruction, initialPrompt: prompt, maxRepairs: options.maxRepairs, model: options.model,
    parseAndValidate: (raw) => {
      const parsedUnknown: unknown = JSON.parse(extractJsonBody(raw));
      if (parsedUnknown === null || typeof parsedUnknown !== 'object' || Array.isArray(parsedUnknown)) {
        const got = parsedUnknown === null ? 'null' : Array.isArray(parsedUnknown) ? 'array' : typeof parsedUnknown;
        return { valid: false, errors: [`expected a JSON object (a Semantic UI AST), got ${got}`] };
      }
      const parsed = parsedUnknown as SemanticUIAst;
      parsed.artifactId = options.artifactId;  // AI does not own identity fields
      parsed.kind = kind;
      const result = validateAst(parsed, { registry });
      if (result.valid) return { valid: true, value: parsed };
      return { valid: false, errors: result.errors.map(e => `${e.path}: ${e.message}`) };
    },
  });
}
