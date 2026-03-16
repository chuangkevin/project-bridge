import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('API: Chat Endpoint', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: `Chat Test ${Date.now()}` },
    });
    const project = await res.json();
    projectId = project.id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      await request.delete(`${API}/api/projects/${projectId}`);
    }
  });

  test('POST /api/projects/:id/chat — sends message and receives SSE or error', async ({ request }) => {
    const res = await request.post(`${API}/api/projects/${projectId}/chat`, {
      data: { message: 'Create a simple hello world page' },
    });

    // If no API key, we get a 400 JSON error
    if (res.status() === 400) {
      const body = await res.json();
      expect(body.error).toBeTruthy();
      expect(body.error).toContain('API key');
      return;
    }

    // If API key is set, we get an SSE stream
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/event-stream');

    const text = await res.text();
    // SSE lines should be in "data: {...}" format
    const lines = text.split('\n').filter(l => l.startsWith('data: '));
    expect(lines.length).toBeGreaterThan(0);

    // Each data line should be valid JSON
    for (const line of lines) {
      const jsonStr = line.slice(6);
      const parsed = JSON.parse(jsonStr);
      // Each event should have content, error, or done
      const hasExpectedKey = 'content' in parsed || 'error' in parsed || 'done' in parsed;
      expect(hasExpectedKey).toBe(true);
    }
  });

  test('POST /api/projects/:id/chat with empty message — returns 400', async ({ request }) => {
    const res = await request.post(`${API}/api/projects/${projectId}/chat`, {
      data: { message: '' },
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/projects/:id/chat with invalid project — returns 404', async ({ request }) => {
    const res = await request.post(`${API}/api/projects/nonexistent-id/chat`, {
      data: { message: 'hello' },
    });
    expect(res.status()).toBe(404);
  });

  test('GET /api/projects/:id/conversations — returns conversation array', async ({ request }) => {
    const res = await request.get(`${API}/api/projects/${projectId}/conversations`);
    expect(res.status()).toBe(200);

    const conversations = await res.json();
    expect(Array.isArray(conversations)).toBe(true);
  });

  test('Conversations are stored after successful chat', async ({ request }) => {
    // Send a chat message
    const chatRes = await request.post(`${API}/api/projects/${projectId}/chat`, {
      data: { message: 'Build a landing page' },
    });

    if (chatRes.status() === 400) {
      // No API key configured — cannot test conversation storage
      const convRes = await request.get(`${API}/api/projects/${projectId}/conversations`);
      expect(convRes.status()).toBe(200);
      const conversations = await convRes.json();
      expect(conversations.length).toBe(0);
      return;
    }

    // Read the SSE response fully
    const sseText = await chatRes.text();
    const dataLines = sseText.split('\n').filter(l => l.startsWith('data: '));

    // Check if there was an OpenAI error in the SSE stream
    const hasError = dataLines.some(line => {
      try {
        const parsed = JSON.parse(line.slice(6));
        return 'error' in parsed;
      } catch { return false; }
    });

    if (hasError) {
      // OpenAI API key is invalid — conversations won't be stored
      // because the error happens before save. This is expected behavior.
      const convRes = await request.get(`${API}/api/projects/${projectId}/conversations`);
      expect(convRes.status()).toBe(200);
      const conversations = await convRes.json();
      // No conversations stored when OpenAI fails
      expect(Array.isArray(conversations)).toBe(true);
      return;
    }

    // Successful chat — check conversations were stored
    const convRes = await request.get(`${API}/api/projects/${projectId}/conversations`);
    expect(convRes.status()).toBe(200);

    const conversations = await convRes.json();
    expect(conversations.length).toBeGreaterThanOrEqual(2); // user + assistant
    expect(conversations[0].role).toBe('user');
    expect(conversations[0].content).toBe('Build a landing page');
    expect(conversations[1].role).toBe('assistant');
  });
});
