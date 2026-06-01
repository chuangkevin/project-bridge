import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('API: Global Design', () => {
  test('GET /api/global-design returns 200 with profile field', async ({ request }) => {
    const res = await request.get(`${API}/api/global-design`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('profile');
    // profile is either null or an object with expected fields
    if (body.profile !== null) {
      expect(typeof body.profile.description).toBe('string');
      expect(typeof body.profile.referenceAnalysis).toBe('string');
    }
  });

  test('PUT /api/global-design saves and GET returns saved values', async ({ request }) => {
    const payload = {
      description: '企業品牌風格，清晰可信',
      referenceAnalysis: 'Clean corporate design with blue tones',
      tokens: {
        primaryColor: '#1d4ed8',
        secondaryColor: '#475569',
        fontFamily: 'sans-serif',
        borderRadius: 6,
        spacing: '正常',
        shadowStyle: '輕柔',
      },
    };

    const putRes = await request.put(`${API}/api/global-design`, { data: payload });
    expect(putRes.status()).toBe(200);
    const putBody = await putRes.json();
    expect(putBody.profile).toBeTruthy();
    expect(putBody.profile.description).toBe(payload.description);
    expect(putBody.profile.referenceAnalysis).toBe(payload.referenceAnalysis);
    expect(putBody.profile.tokens.primaryColor).toBe(payload.tokens.primaryColor);
    expect(putBody.profile.tokens.borderRadius).toBe(payload.tokens.borderRadius);

    // Verify GET returns the same values
    const getRes = await request.get(`${API}/api/global-design`);
    expect(getRes.status()).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.profile).toBeTruthy();
    expect(getBody.profile.description).toBe(payload.description);
    expect(getBody.profile.tokens.primaryColor).toBe(payload.tokens.primaryColor);
  });

  test('PUT is idempotent — second PUT overwrites first', async ({ request }) => {
    await request.put(`${API}/api/global-design`, {
      data: { description: 'First global style', tokens: { primaryColor: '#ff0000' } },
    });
    await request.put(`${API}/api/global-design`, {
      data: { description: 'Second global style', tokens: { primaryColor: '#00ff00' } },
    });

    const res = await request.get(`${API}/api/global-design`);
    const body = await res.json();
    expect(body.profile.description).toBe('Second global style');
    expect(body.profile.tokens.primaryColor).toBe('#00ff00');
  });
});

test.describe('API: Project Design — inheritGlobal and supplement', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: `Inherit Design Test ${Date.now()}` },
    });
    const project = await res.json();
    projectId = project.id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      await request.delete(`${API}/api/projects/${projectId}`);
    }
  });

  test('GET /api/projects/:id/design includes inheritGlobal and supplement', async ({ request }) => {
    // Save a design first so the profile exists
    await request.put(`${API}/api/projects/${projectId}/design`, {
      data: { description: '測試設計', inheritGlobal: true, supplement: '' },
    });

    const res = await request.get(`${API}/api/projects/${projectId}/design`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.profile).toBeTruthy();
    expect(typeof body.profile.inheritGlobal).toBe('boolean');
    expect(typeof body.profile.supplement).toBe('string');
  });

  test('GET /api/projects/:id/design defaults inheritGlobal to true', async ({ request }) => {
    await request.put(`${API}/api/projects/${projectId}/design`, {
      data: { description: '測試預設繼承' },
    });

    const res = await request.get(`${API}/api/projects/${projectId}/design`);
    const body = await res.json();
    expect(body.profile.inheritGlobal).toBe(true);
  });

  test('PUT /api/projects/:id/design with inheritGlobal: false saves correctly', async ({ request }) => {
    const payload = {
      description: '不繼承全域風格的專案',
      inheritGlobal: false,
      supplement: '',
    };

    const res = await request.put(`${API}/api/projects/${projectId}/design`, { data: payload });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.profile.inheritGlobal).toBe(false);

    // Verify persisted
    const getRes = await request.get(`${API}/api/projects/${projectId}/design`);
    const getBody = await getRes.json();
    expect(getBody.profile.inheritGlobal).toBe(false);
  });

  test('PUT /api/projects/:id/design saves supplement field', async ({ request }) => {
    const supplement = '此專案 CTA 按鈕用橘色 #f97316';
    await request.put(`${API}/api/projects/${projectId}/design`, {
      data: { description: '測試補充說明', inheritGlobal: true, supplement },
    });

    const res = await request.get(`${API}/api/projects/${projectId}/design`);
    const body = await res.json();
    expect(body.profile.supplement).toBe(supplement);
  });
});
