import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';
let projectId: string;

test.beforeAll(async ({ request }) => {
  const res = await request.post(`${API}/api/projects`, { data: { name: 'Arch Test' } });
  projectId = (await res.json()).id;
});

test.afterAll(async ({ request }) => {
  await request.delete(`${API}/api/projects/${projectId}`);
});

test('GET /architecture — returns null when not set', async ({ request }) => {
  const res = await request.get(`${API}/api/projects/${projectId}/architecture`);
  expect(res.status()).toBe(200);
  expect((await res.json()).arch_data).toBeNull();
});

test('PATCH /architecture — saves arch_data', async ({ request }) => {
  const archData = {
    type: 'page', subtype: 'website', aiDecidePages: false,
    nodes: [{ id: 'n1', nodeType: 'page', name: '首頁', position: { x: 0, y: 0 }, referenceFileId: null, referenceFileUrl: null }],
    edges: [],
  };
  const res = await request.patch(`${API}/api/projects/${projectId}/architecture`, { data: { arch_data: archData } });
  expect(res.status()).toBe(200);
  expect((await res.json()).ok).toBe(true);
});

test('GET /architecture — returns saved arch_data', async ({ request }) => {
  const res = await request.get(`${API}/api/projects/${projectId}/architecture`);
  const body = await res.json();
  expect(body.arch_data?.nodes[0]?.name).toBe('首頁');
});

test('GET /api/projects/:id — includes arch_data field', async ({ request }) => {
  const res = await request.get(`${API}/api/projects/${projectId}`);
  expect('arch_data' in (await res.json())).toBe(true);
});

test('POST /upload with page_name — echoes page_name in response', async ({ request }) => {
  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  const res = await request.post(`${API}/api/projects/${projectId}/upload`, {
    multipart: {
      file: { name: 'test.png', mimeType: 'image/png', buffer: tinyPng },
      page_name: '列表頁',
    },
  });
  expect(res.status()).toBe(201);
  expect((await res.json()).page_name).toBe('列表頁');
});
