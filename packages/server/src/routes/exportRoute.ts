/**
 * exportRoute.ts — export design artifacts for a project.
 *
 * POST /api/projects/:id/export
 * Body: { framework: 'vue3' | 'html' | 'react' | 'zip' }
 *
 * Collects all active (non-superseded) vue-sfc artifacts for the project,
 * reads their payloads, and packages them in the requested format.
 *
 * - vue3  → JSON { files: [{ filename, content }] }
 * - html  → JSON { files: [{ filename, content }] } (Tailwind CDN wrapper)
 * - react → JSON { files: [{ filename, content }] } (simple JSX conversion, no AI)
 * - zip   → tar.gz binary stream with Content-Disposition attachment
 */

import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { pack } from 'tar-stream';
import { createGzip } from 'node:zlib';
import { getProject } from '../services/projectService.js';
import { listArtifacts, readArtifactPayload } from '../services/artifactService.js';

const VALID_FRAMEWORKS = ['vue3', 'html', 'react', 'zip'] as const;
type Framework = typeof VALID_FRAMEWORKS[number];

/** Derive a safe .vue filename from the artifact name. */
function toVueFilename(name: string): string {
  // Convert kebab-case or space-separated to PascalCase, then append .vue
  const pascal = name
    .replace(/[-_\s]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (_, c: string) => c.toUpperCase());
  return `${pascal || 'Page'}.vue`;
}

/** Wrap a Vue SFC template block in a standalone HTML file with Tailwind CDN. */
function wrapInHtml(name: string, sfcSource: string): string {
  // Extract the content of the first <template> block
  const templateMatch = sfcSource.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
  const body = templateMatch ? templateMatch[1].trim() : sfcSource.trim();

  const title = name.replace(/[-_]/g, ' ');
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
${body}
</body>
</html>`;
}

/** Convert a Vue SFC template to a simple React functional component — no AI, no dependencies. */
function vueToReact(name: string, sfcSource: string): string {
  // Extract template block content
  const templateMatch = sfcSource.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
  const jsx = templateMatch ? templateMatch[1].trim() : '<div>{/* empty */}</div>';

  // Convert PascalCase component name
  const pascal = name
    .replace(/[-_\s]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (_, c: string) => c.toUpperCase());
  const componentName = pascal || 'Page';

  // Basic Vue → JSX transformations (best-effort, keeps HTML valid in most cases)
  const transformed = jsx
    .replace(/\bclass=/g, 'className=')
    .replace(/:class="/g, 'className={')
    .replace(/v-if="([^"]+)"/g, '{/* v-if: $1 */}')
    .replace(/v-for="([^"]+)"/g, '{/* v-for: $1 */}')
    .replace(/@click="([^"]+)"/g, 'onClick={() => $1}');

  return `import React from 'react';

export default function ${componentName}() {
  return (
    ${transformed}
  );
}
`;
}

export function buildExportRouter(db: Database.Database, dataDir: string): Router {
  const r = Router({ mergeParams: true });

  r.post('/export', async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }

    const frameworkRaw = (req.body?.framework ?? req.query.framework) as string | undefined;
    const framework: Framework = (VALID_FRAMEWORKS as readonly string[]).includes(frameworkRaw ?? '')
      ? (frameworkRaw as Framework)
      : 'vue3';

    // Collect all active vue-sfc artifacts
    const artifacts = listArtifacts(db, projectId, { kind: 'vue-sfc' });
    if (artifacts.length === 0) {
      res.json({ files: [] });
      return;
    }

    // Read all payloads
    const files: Array<{ filename: string; content: string }> = [];
    for (const artifact of artifacts) {
      let content: string;
      try {
        content = readArtifactPayload(dataDir, artifact);
      } catch (err) {
        console.warn(`[export] failed to read artifact ${artifact.id}: ${(err as Error).message}`);
        continue;
      }

      const baseName = artifact.name;

      if (framework === 'vue3' || framework === 'zip') {
        files.push({ filename: toVueFilename(baseName), content });
      } else if (framework === 'html') {
        const htmlFilename = toVueFilename(baseName).replace(/\.vue$/, '.html');
        files.push({ filename: htmlFilename, content: wrapInHtml(baseName, content) });
      } else if (framework === 'react') {
        const jsxFilename = toVueFilename(baseName).replace(/\.vue$/, '.jsx');
        files.push({ filename: jsxFilename, content: vueToReact(baseName, content) });
      }
    }

    if (framework !== 'zip') {
      res.json({ files });
      return;
    }

    // Build tar.gz stream
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', 'attachment; filename="design-export.tar.gz"');

    const tarPack = pack();
    const gzip = createGzip();
    tarPack.pipe(gzip).pipe(res);

    for (const f of files) {
      const buf = Buffer.from(f.content, 'utf8');
      tarPack.entry({ name: f.filename, size: buf.length }, buf, (err) => {
        if (err) console.warn(`[export] tar entry error: ${err.message}`);
      });
    }

    tarPack.finalize();
  });

  return r;
}
