import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const API = 'http://localhost:3001';

test.describe('API: File Upload', () => {
  const createdIds: string[] = [];
  let tmpDir: string;

  test.beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-upload-'));
  });

  test.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test.afterEach(async ({ request }) => {
    for (const id of createdIds) {
      try {
        await request.delete(`${API}/api/projects/${id}`);
      } catch {
        // ignore cleanup errors
      }
    }
    createdIds.length = 0;
  });

  test('POST /api/projects/:id/upload with .txt file — returns 201', async ({ request }) => {
    // Create project
    const projRes = await request.post(`${API}/api/projects`, {
      data: { name: 'Upload Test' },
    });
    const project = await projRes.json();
    createdIds.push(project.id);

    // Create a temp .txt file
    const filePath = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(filePath, 'Hello, this is test content for upload.');

    const res = await request.post(`${API}/api/projects/${project.id}/upload`, {
      multipart: {
        file: {
          name: 'test.txt',
          mimeType: 'text/plain',
          buffer: fs.readFileSync(filePath),
        },
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.originalName).toBe('test.txt');
    expect(body.mimeType).toBe('text/plain');
    expect(body.fileSize).toBeGreaterThan(0);
    expect(typeof body.extractedText).toBe('string');
  });

  test('POST /api/projects/:id/upload with unsupported file type — returns 400', async ({ request }) => {
    // Create project
    const projRes = await request.post(`${API}/api/projects`, {
      data: { name: 'Upload Bad Type' },
    });
    const project = await projRes.json();
    createdIds.push(project.id);

    const res = await request.post(`${API}/api/projects/${project.id}/upload`, {
      multipart: {
        file: {
          name: 'malware.exe',
          mimeType: 'application/octet-stream',
          buffer: Buffer.from('fake binary content'),
        },
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('POST /api/projects/:id/upload to non-existent project — returns 404', async ({ request }) => {
    const filePath = path.join(tmpDir, 'orphan.txt');
    fs.writeFileSync(filePath, 'orphan file');

    const res = await request.post(`${API}/api/projects/nonexistent-id-99999/upload`, {
      multipart: {
        file: {
          name: 'orphan.txt',
          mimeType: 'text/plain',
          buffer: fs.readFileSync(filePath),
        },
      },
    });

    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
