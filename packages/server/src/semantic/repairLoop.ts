import type { GenerateFn } from './generate';

export type ParseResult<T> = { valid: true; value: T } | { valid: false; errors: string[] };

export interface RepairLoopArgs<T> {
  generate: GenerateFn;
  systemInstruction: string;
  initialPrompt: string;
  /** Parse + validate raw model text. A thrown error is caught and treated as invalid. */
  parseAndValidate: (raw: string) => ParseResult<T>;
  /** REPAIR attempts after the first try. Total calls = maxRepairs + 1. Default 2. */
  maxRepairs?: number;
  model?: string;
  maxOutputTokens?: number;
}

function repairSuffix(errors: string[]): string {
  return [
    '', 'Your previous response was INVALID for these reasons:',
    ...errors.map(e => `- ${e}`), '',
    'Re-emit the COMPLETE corrected JSON (not a diff). Fix every issue above. Respond with JSON only.',
  ].join('\n');
}

export async function runRepairLoop<T>(args: RepairLoopArgs<T>): Promise<T> {
  const maxRepairs = args.maxRepairs ?? 2;
  let prompt = args.initialPrompt;
  let lastErrors: string[] = ['no attempts made'];

  for (let attempt = 0; attempt <= maxRepairs; attempt += 1) {
    const raw = await args.generate({
      systemInstruction: args.systemInstruction, prompt, model: args.model, maxOutputTokens: args.maxOutputTokens,
    });
    let result: ParseResult<T>;
    try {
      result = args.parseAndValidate(raw);
    } catch (err) {
      result = { valid: false, errors: [`parse error: ${(err as Error).message}`] };
    }
    if (result.valid) return result.value;
    lastErrors = result.errors;
    prompt = args.initialPrompt + repairSuffix(result.errors);
  }
  throw new Error(`AI output failed validation after ${maxRepairs} repair attempts:\n${lastErrors.map(e => `  - ${e}`).join('\n')}`);
}
