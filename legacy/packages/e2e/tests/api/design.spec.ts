import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('API: Design Profile', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: `Design Profile Test ${Date.now()}` },
    });
    const project = await res.json();
    projectId = project.id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      await request.delete(`${API}/api/projects/${projectId}`);
    }
  });

  test('GET design profile returns null initially', async ({ request }) => {
    const res = await request.get(`${API}/api/projects/${projectId}/design`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.profile).toBeNull();
  });

  test('PUT design profile upserts and returns saved values', async ({ request }) => {
    const payload = {
      description: '現代簡約，企業感',
      referenceAnalysis: 'Clean minimal design with blue accents',
      tokens: {
        primaryColor: '#3b82f6',
        secondaryColor: '#64748b',
        fontFamily: 'sans-serif',
        borderRadius: 12,
        spacing: '正常',
        shadowStyle: '輕柔',
      },
    };

    const res = await request.put(`${API}/api/projects/${projectId}/design`, {
      data: payload,
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.profile).toBeTruthy();
    expect(body.profile.description).toBe(payload.description);
    expect(body.profile.referenceAnalysis).toBe(payload.referenceAnalysis);
    expect(body.profile.tokens).toBeTruthy();
    expect(body.profile.tokens.primaryColor).toBe(payload.tokens.primaryColor);
    expect(body.profile.tokens.borderRadius).toBe(payload.tokens.borderRadius);
    expect(body.profile.projectId).toBe(projectId);
    expect(body.profile.id).toBeTruthy();
  });

  test('GET after PUT returns the saved design profile', async ({ request }) => {
    const payload = {
      description: '視覺風格測試',
      referenceAnalysis: 'Bold typography, high contrast',
      tokens: {
        primaryColor: '#ef4444',
        secondaryColor: '#22c55e',
        fontFamily: 'serif',
        borderRadius: 4,
        spacing: '緊湊',
        shadowStyle: '明顯',
      },
    };

    // Save it
    await request.put(`${API}/api/projects/${projectId}/design`, { data: payload });

    // Fetch it back
    const res = await request.get(`${API}/api/projects/${projectId}/design`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.profile).toBeTruthy();
    expect(body.profile.description).toBe(payload.description);
    expect(body.profile.referenceAnalysis).toBe(payload.referenceAnalysis);
    expect(body.profile.tokens.primaryColor).toBe(payload.tokens.primaryColor);
    expect(body.profile.tokens.fontFamily).toBe(payload.tokens.fontFamily);
    expect(body.profile.tokens.spacing).toBe(payload.tokens.spacing);
  });

  test('PUT is idempotent — second PUT overwrites first', async ({ request }) => {
    await request.put(`${API}/api/projects/${projectId}/design`, {
      data: { description: 'First description', tokens: { primaryColor: '#ff0000' } },
    });

    await request.put(`${API}/api/projects/${projectId}/design`, {
      data: { description: 'Second description', tokens: { primaryColor: '#00ff00' } },
    });

    const res = await request.get(`${API}/api/projects/${projectId}/design`);
    const body = await res.json();
    expect(body.profile.description).toBe('Second description');
    expect(body.profile.tokens.primaryColor).toBe('#00ff00');
  });

  test('GET design on non-existent project returns 404', async ({ request }) => {
    const res = await request.get(`${API}/api/projects/nonexistent-project-id/design`);
    expect(res.status()).toBe(404);
  });

  test('PUT design on non-existent project returns 404', async ({ request }) => {
    const res = await request.put(`${API}/api/projects/nonexistent-project-id/design`, {
      data: { description: 'test' },
    });
    expect(res.status()).toBe(404);
  });
});
