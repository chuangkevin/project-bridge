import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('API: Platform Shell', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: `Platform Shell Test ${Date.now()}` },
    });
    const project = await res.json();
    projectId = project.id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) await request.delete(`${API}/api/projects/${projectId}`);
  });

  test('GET returns null initially', async ({ request }) => {
    const res = await request.get(`${API}/api/projects/${projectId}/platform-shell`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.shell).toBeNull();
  });

  test('PUT saves shell and GET returns saved shellHtml', async ({ request }) => {
    const shellHtml = '<!DOCTYPE html><html><body><nav>NAV</nav><main>{CONTENT}</main></body></html>';
    const putRes = await request.put(`${API}/api/projects/${projectId}/platform-shell`, {
      data: { shellHtml },
    });
    expect(putRes.status()).toBe(200);
    const putBody = await putRes.json();
    expect(putBody.shell.shellHtml).toBe(shellHtml);

    const getRes = await request.get(`${API}/api/projects/${projectId}/platform-shell`);
    const getBody = await getRes.json();
    expect(getBody.shell).toBeTruthy();
    expect(getBody.shell.shellHtml).toBe(shellHtml);
  });

  test('PUT without {CONTENT} auto-inserts placeholder', async ({ request }) => {
    const shellHtml = '<!DOCTYPE html><html><body><nav>NAV</nav></body></html>';
    const res = await request.put(`${API}/api/projects/${projectId}/platform-shell`, {
      data: { shellHtml },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.shell.shellHtml).toContain('{CONTENT}');
  });

  test('PUT without shellHtml returns 400', async ({ request }) => {
    const res = await request.put(`${API}/api/projects/${projectId}/platform-shell`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('POST /extract returns 404 when no prototype exists', async ({ request }) => {
    const res = await request.post(`${API}/api/projects/${projectId}/platform-shell/extract`);
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('No prototype version found');
  });

  test('GET on non-existent project returns 404', async ({ request }) => {
    const res = await request.get(`${API}/api/projects/nonexistent-id/platform-shell`);
    expect(res.status()).toBe(404);
  });

  test('PUT is idempotent — second PUT overwrites first', async ({ request }) => {
    await request.put(`${API}/api/projects/${projectId}/platform-shell`, {
      data: { shellHtml: '<nav>first</nav><main>{CONTENT}</main>' },
    });
    await request.put(`${API}/api/projects/${projectId}/platform-shell`, {
      data: { shellHtml: '<nav>second</nav><main>{CONTENT}</main>' },
    });
    const res = await request.get(`${API}/api/projects/${projectId}/platform-shell`);
    const body = await res.json();
    expect(body.shell.shellHtml).toContain('second');
    expect(body.shell.shellHtml).not.toContain('first');
  });
});
