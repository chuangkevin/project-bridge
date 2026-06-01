import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extract } from 'tar-stream';
import { createGunzip } from 'node:zlib';
import { openDb } from '../../db/connection';
import { runMigrations, defaultMigrationsDir } from '../../db/migrator';
import { createUser } from '../authService';
import { createProject } from '../projectService';
import { buildProjectBackup } from '../backupService';

let dataDir: string;
let db: ReturnType<typeof openDb>;
let projectId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'bk-'));
  db = openDb(dataDir);
  runMigrations(db, defaultMigrationsDir());
  const u = await createUser(db, { name: 'A', email: 'a@x.com', password: 'pw12345678' });
  projectId = createProject(db, u.id, 'TestProject').id;
});
afterEach(() => { db.close(); rmSync(dataDir, { recursive: true, force: true }); });

describe('buildProjectBackup', () => {
  it('creates a tar.gz containing manifest + files', async () => {
    // create an uploads file
    const uploadsDir = join(dataDir, 'projects', projectId, 'uploads');
    mkdirSync(uploadsDir, { recursive: true });
    writeFileSync(join(uploadsDir, 'test.txt'), 'hello');

    const stream = buildProjectBackup(db, projectId, dataDir);
    const entries: Array<{ name: string; content: string }> = [];
    await new Promise<void>((resolve, reject) => {
      const ex = extract();
      ex.on('entry', (header, body, next) => {
        const chunks: Buffer[] = [];
        body.on('data', (c: Buffer) => chunks.push(c));
        body.on('end', () => { entries.push({ name: header.name, content: Buffer.concat(chunks).toString('utf8') }); next(); });
      });
      ex.on('finish', resolve);
      ex.on('error', reject);
      stream.pipe(createGunzip()).pipe(ex);
    });

    const manifest = entries.find(e => e.name === 'manifest.json');
    expect(manifest).toBeDefined();
    const m = JSON.parse(manifest!.content);
    expect(m.version).toBe(1);
    expect(m.project.id).toBe(projectId);
    expect(m.generatedAt).toBeTruthy();

    const upload = entries.find(e => e.name === 'uploads/test.txt');
    expect(upload?.content).toBe('hello');
  });

  it('includes only uploads and artifacts subdirs', async () => {
    // Create uploads and artifacts dirs with files
    const uploadsDir = join(dataDir, 'projects', projectId, 'uploads');
    const artifactsDir = join(dataDir, 'projects', projectId, 'artifacts');
    mkdirSync(uploadsDir, { recursive: true });
    mkdirSync(artifactsDir, { recursive: true });
    writeFileSync(join(uploadsDir, 'doc.pdf'), 'pdf-content');
    writeFileSync(join(artifactsDir, 'graph.json'), '{"nodes":[]}');

    const stream = buildProjectBackup(db, projectId, dataDir);
    const names: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const ex = extract();
      ex.on('entry', (header, body, next) => {
        names.push(header.name);
        body.resume();
        body.on('end', next);
      });
      ex.on('finish', resolve);
      ex.on('error', reject);
      stream.pipe(createGunzip()).pipe(ex);
    });

    expect(names).toContain('manifest.json');
    expect(names).toContain('uploads/doc.pdf');
    expect(names).toContain('artifacts/graph.json');
  });

  it('works without any project files (manifest only)', async () => {
    const stream = buildProjectBackup(db, projectId, dataDir);
    const names: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const ex = extract();
      ex.on('entry', (header, body, next) => {
        names.push(header.name);
        body.resume();
        body.on('end', next);
      });
      ex.on('finish', resolve);
      ex.on('error', reject);
      stream.pipe(createGunzip()).pipe(ex);
    });

    expect(names).toEqual(['manifest.json']);
  });

  it('throws on missing project', () => {
    expect(() => buildProjectBackup(db, 'no-such', dataDir)).toThrow('project not found');
  });
});
