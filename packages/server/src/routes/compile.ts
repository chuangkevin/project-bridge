import { Router, type Request, type Response } from 'express';
import type { SemanticUIAst } from '@designbridge/ast';
import * as compileService from '../services/compile';

/** POST /:id/compile — cold start from a text requirement. */
export async function compileHandler(req: Request, res: Response): Promise<void> {
  const artifactId = typeof req.body?.artifactId === 'string' && req.body.artifactId.trim() ? req.body.artifactId.trim() : 'artifact';
  const requirement = req.body?.requirement;
  if (typeof requirement !== 'string' || requirement.trim().length === 0) {
    res.status(400).json({ error: 'requirement (non-empty string) is required' });
    return;
  }
  try {
    const result = await compileService.compileFromInput({ kind: 'requirement', text: requirement }, { artifactId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

/** POST /:id/compile/mutate — apply an NL edit to an existing AST. */
export async function mutateHandler(req: Request, res: Response): Promise<void> {
  const ast = req.body?.ast as SemanticUIAst | undefined;
  const instruction = req.body?.instruction;
  if (!ast || typeof ast !== 'object' || typeof instruction !== 'string' || instruction.trim().length === 0) {
    res.status(400).json({ error: 'ast (object) and instruction (non-empty string) are required' });
    return;
  }
  try {
    const result = await compileService.compileMutation(ast, instruction);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

const router = Router();
router.post('/:id/compile', compileHandler);
router.post('/:id/compile/mutate', mutateHandler);
export default router;
