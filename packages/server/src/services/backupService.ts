import { pack, type Pack } from 'tar-stream';
import { createGzip } from 'node:zlib';
import { createReadStream, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type Database from 'better-sqlite3';

interface BackupManifest {
  version: 1;
  generatedAt: string;
  project: Record<string, unknown>;
  turns: Array<Record<string, unknown>>;
  facts: Array<Record<string, unknown>>;
  artifacts: Array<Record<string, unknown>>;
  attachments: Array<Record<string, unknown>>;
  projectSkills: Array<Record<string, unknown>>;
}

/**
 * Streams a gzipped tar archive of a project: manifest.json + uploads/ + artifacts/.
 * Returns the gzip stream end of the pipeline (consumer pipes to response or file).
 */
export function buildProjectBackup(db: Database.Database, projectId: string, dataDir: string): Readable {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) throw new Error('project not found');

  const manifest: BackupManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    project: project as Record<string, unknown>,
    turns: db.prepare('SELECT * FROM turns WHERE project_id = ? ORDER BY created_at').all(projectId) as Array<Record<string, unknown>>,
    facts: db.prepare('SELECT * FROM extracted_facts WHERE project_id = ?').all(projectId) as Array<Record<string, unknown>>,
    artifacts: db.prepare('SELECT * FROM artifacts WHERE project_id = ?').all(projectId) as Array<Record<string, unknown>>,
    attachments: db.prepare('SELECT * FROM attachments WHERE project_id = ?').all(projectId) as Array<Record<string, unknown>>,
    projectSkills: db.prepare('SELECT * FROM project_skills WHERE project_id = ?').all(projectId) as Array<Record<string, unknown>>,
  };

  const tarPack: Pack = pack();
  const gzip = createGzip({ level: 6 });
  tarPack.pipe(gzip);

  // Write manifest synchronously (small)
  tarPack.entry({ name: 'manifest.json' }, JSON.stringify(manifest, null, 2));

  // Collect files to stream
  const projectDir = join(dataDir, 'projects', projectId);
  const filesAdded: Array<{ archivePath: string; absPath: string; size: number }> = [];

  for (const sub of ['uploads', 'artifacts']) {
    const absDir = join(projectDir, sub);
    if (!existsSync(absDir)) continue;
    for (const file of readdirSync(absDir)) {
      const abs = join(absDir, file);
      const st = statSync(abs);
      if (!st.isFile()) continue;
      filesAdded.push({ archivePath: `${sub}/${file}`, absPath: abs, size: st.size });
    }
  }

  // Sequentially add files using tar-stream's async API
  void (async () => {
    for (const f of filesAdded) {
      await new Promise<void>((resolve, reject) => {
        const entry = tarPack.entry({ name: f.archivePath, size: f.size }, (err) => {
          if (err) reject(err); else resolve();
        });
        createReadStream(f.absPath).on('error', reject).pipe(entry);
      });
    }
    tarPack.finalize();
  })().catch((err) => tarPack.destroy(err as Error));

  return gzip;
}
