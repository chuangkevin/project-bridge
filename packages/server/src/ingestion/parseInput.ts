import type { IngestionAst } from '@designbridge/ast';
import { parseRequirement } from './parseRequirement';
import { parsePdf } from './parsePdf';

export type RawInput =
  | { kind: 'requirement'; text: string; source?: 'chat' | 'pasted-text' }
  | { kind: 'pdf'; buffer: Buffer; extractPages?: (buffer: Buffer) => Promise<string[]> };

/**
 * Routes a raw input to its deterministic parser, producing an IngestionAst.
 * Only `requirement` and `pdf` are implemented in Plan 2; screenshot/clipboard/webpage
 * are defined in the union but throw here until their parsers land.
 */
export async function parseInput(input: RawInput): Promise<IngestionAst> {
  switch (input.kind) {
    case 'requirement':
      return parseRequirement(input.text, input.source);
    case 'pdf':
      return parsePdf(input.buffer, input.extractPages ? { extractPages: input.extractPages } : {});
    default: {
      throw new Error(`parseInput: input kind "${(input as { kind: string }).kind}" is not yet implemented`);
    }
  }
}
