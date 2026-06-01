import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

// Minimal 1x1 red PNG (base64-encoded)
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

test.describe('API: Design Spec Analysis', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: `Design Spec Analysis Test ${Date.now()}` },
    });
    expect(res.status()).toBe(201);
    const project = await res.json();
    projectId = project.id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      await request.delete(`${API}/api/projects/${projectId}`);
    }
  });

  // Test 7.1 — uploading a PNG returns a visualAnalysisReady field (boolean)
  // The field value depends on whether an OpenAI API key is configured, so we
  // only assert that the field exists and is a boolean.
  test('uploading a PNG returns visualAnalysisReady field', async ({ request }) => {
    const res = await request.post(`${API}/api/projects/${projectId}/upload`, {
      multipart: {
        file: {
          name: 'test.png',
          mimeType: 'image/png',
          buffer: TINY_PNG,
        },
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();

    // Core upload fields must be present
    expect(body.id).toBeTruthy();
    expect(body.originalName).toBe('test.png');
    expect(body.mimeType).toBe('image/png');

    // visualAnalysisReady must be present and be a boolean — its value
    // depends on whether an OpenAI API key is configured, so we don't
    // assert true/false here.
    expect(body).toHaveProperty('visualAnalysisReady');
    expect(typeof body.visualAnalysisReady).toBe('boolean');
  });

  // Test 7.2 — uploading a plain-text file must return visualAnalysisReady: false
  // Text files are never eligible for visual analysis regardless of API key state.
  test('uploading a text file returns visualAnalysisReady: false', async ({ request }) => {
    const textBuffer = Buffer.from('This is a plain text design brief.\nNo visual content here.', 'utf-8');

    const res = await request.post(`${API}/api/projects/${projectId}/upload`, {
      multipart: {
        file: {
          name: 'brief.txt',
          mimeType: 'text/plain',
          buffer: textBuffer,
        },
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();

    expect(body.id).toBeTruthy();
    expect(body.originalName).toBe('brief.txt');
    expect(body.mimeType).toBe('text/plain');

    // Text files must never receive visual analysis
    expect(body).toHaveProperty('visualAnalysisReady');
    expect(body.visualAnalysisReady).toBe(false);
  });

  // Test 7.3 — the chat endpoint still works after files have been uploaded.
  // This confirms that injecting visual_analysis context into the prompt
  // (when it exists in the DB) does not break the generation pipeline.
  test('chat endpoint still works after files are uploaded', async ({ request }) => {
    // First upload a PNG so that visual_analysis may be populated in the DB
    const uploadRes = await request.post(`${API}/api/projects/${projectId}/upload`, {
      multipart: {
        file: {
          name: 'spec.png',
          mimeType: 'image/png',
          buffer: TINY_PNG,
        },
      },
    });
    expect(uploadRes.status()).toBe(201);

    // Also upload a text file to exercise the mixed-file path
    const uploadTxtRes = await request.post(`${API}/api/projects/${projectId}/upload`, {
      multipart: {
        file: {
          name: 'notes.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('Design notes: keep it minimal.', 'utf-8'),
        },
      },
    });
    expect(uploadTxtRes.status()).toBe(201);

    // Now POST to the chat endpoint — it should either:
    //  • return 400 with an "API key" error (no key configured), or
    //  • return 200 with a text/event-stream SSE response (key configured).
    // Either outcome proves the endpoint handled the request without crashing
    // due to the presence of uploaded files / visual_analysis in the DB.
    const chatRes = await request.post(`${API}/api/projects/${projectId}/chat`, {
      data: { message: 'Generate a simple landing page based on the uploaded spec.' },
    });

    if (chatRes.status() === 400) {
      // No API key — verify it's the expected error, not a server crash
      const body = await chatRes.json();
      expect(body.error).toBeTruthy();
      expect(body.error).toContain('API key');
      return;
    }

    // API key is configured — expect a valid SSE stream to start
    expect(chatRes.status()).toBe(200);
    const contentType = chatRes.headers()['content-type'] ?? '';
    expect(contentType).toContain('text/event-stream');

    const text = await chatRes.text();
    const dataLines = text.split('\n').filter((l) => l.startsWith('data: '));
    expect(dataLines.length).toBeGreaterThan(0);

    // Every SSE data line must be valid JSON containing at least one known key
    for (const line of dataLines) {
      const jsonStr = line.slice(6);
      const parsed = JSON.parse(jsonStr);
      const hasExpectedKey = 'content' in parsed || 'error' in parsed || 'done' in parsed;
      expect(hasExpectedKey).toBe(true);
    }
  });
});
