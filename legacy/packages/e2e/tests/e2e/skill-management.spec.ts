import { test, expect, type APIRequestContext } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:3001';
const ADMIN_PASSWORD = '1q2w3e4r5t_';

// ─── Auth Helper ─────────────────────────────────────────

async function getAdminToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API}/api/auth/verify`, {
    data: { password: ADMIN_PASSWORD },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return body.token;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ─── Cleanup Helper ──────────────────────────────────────

async function deleteSkillByName(
  request: APIRequestContext,
  token: string,
  name: string,
) {
  const listRes = await request.get(`${API}/api/skills`, {
    headers: authHeaders(token),
  });
  if (listRes.status() !== 200) return;
  const skills: { id: string; name: string }[] = await listRes.json();
  const skill = skills.find((s) => s.name === name);
  if (skill) {
    await request.delete(`${API}/api/skills/${skill.id}`, {
      headers: authHeaders(token),
    });
  }
}

async function deleteSkillsByPrefix(
  request: APIRequestContext,
  token: string,
  prefix: string,
) {
  const listRes = await request.get(`${API}/api/skills`, {
    headers: authHeaders(token),
  });
  if (listRes.status() !== 200) return;
  const skills: { id: string; name: string }[] = await listRes.json();
  const ids = skills.filter((s) => s.name.startsWith(prefix)).map((s) => s.id);
  if (ids.length > 0) {
    await request.post(`${API}/api/skills/batch-action`, {
      headers: authHeaders(token),
      data: { ids, action: 'delete' },
    });
  }
}

// ─── 1. Skill CRUD via API ───────────────────────────────

test.describe.serial('Skill CRUD via API', () => {
  const TEST_PREFIX = 'e2e-crud-';
  let token: string;
  let createdSkillId: string;

  test.beforeAll(async ({ request }) => {
    token = await getAdminToken(request);
    await deleteSkillsByPrefix(request, token, TEST_PREFIX);
  });

  test.afterAll(async ({ request }) => {
    await deleteSkillsByPrefix(request, token, TEST_PREFIX);
  });

  test('create skill via API', async ({ request }) => {
    test.setTimeout(30000);
    const res = await request.post(`${API}/api/skills`, {
      headers: authHeaders(token),
      data: {
        name: `${TEST_PREFIX}test-skill`,
        description: 'A test skill for E2E',
        content: 'This is the skill content for testing.',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.name).toBe(`${TEST_PREFIX}test-skill`);
    expect(body.id).toBeTruthy();
    createdSkillId = body.id;
  });

  test('list skills includes created skill', async ({ request }) => {
    test.setTimeout(30000);
    const res = await request.get(`${API}/api/skills`, {
      headers: authHeaders(token),
    });
    expect(res.status()).toBe(200);
    const skills: { id: string; name: string }[] = await res.json();
    const found = skills.find((s) => s.name === `${TEST_PREFIX}test-skill`);
    expect(found).toBeTruthy();
    expect(found!.id).toBe(createdSkillId);
  });

  test('delete skill via API', async ({ request }) => {
    test.setTimeout(30000);
    const res = await request.delete(`${API}/api/skills/${createdSkillId}`, {
      headers: authHeaders(token),
    });
    expect(res.status()).toBe(200);

    // Verify it's gone
    const listRes = await request.get(`${API}/api/skills`, {
      headers: authHeaders(token),
    });
    const skills: { id: string; name: string }[] = await listRes.json();
    const found = skills.find((s) => s.id === createdSkillId);
    expect(found).toBeFalsy();
  });
});

// ─── 2. Batch Import via API ─────────────────────────────

test.describe.serial('Batch Import via API', () => {
  const TEST_PREFIX = 'e2e-batch-';
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAdminToken(request);
    await deleteSkillsByPrefix(request, token, TEST_PREFIX);
  });

  test.afterAll(async ({ request }) => {
    await deleteSkillsByPrefix(request, token, TEST_PREFIX);
  });

  test('batch import creates and updates skills', async ({ request }) => {
    test.setTimeout(30000);

    // First import — creates 2 skills
    const res1 = await request.post(`${API}/api/skills/batch`, {
      headers: authHeaders(token),
      data: [
        {
          name: `${TEST_PREFIX}alpha`,
          description: 'Alpha skill',
          content: 'Alpha content.',
        },
        {
          name: `${TEST_PREFIX}beta`,
          description: 'Beta skill',
          content: 'Beta content.',
        },
      ],
    });
    expect(res1.status()).toBe(200);
    const body1 = await res1.json();
    expect(body1.imported).toBe(2);
    expect(body1.updated).toBe(0);

    // Second import — updates alpha, creates gamma
    const res2 = await request.post(`${API}/api/skills/batch`, {
      headers: authHeaders(token),
      data: [
        {
          name: `${TEST_PREFIX}alpha`,
          description: 'Alpha skill v2',
          content: 'Alpha updated content.',
        },
        {
          name: `${TEST_PREFIX}gamma`,
          description: 'Gamma skill',
          content: 'Gamma content.',
        },
      ],
    });
    expect(res2.status()).toBe(200);
    const body2 = await res2.json();
    expect(body2.imported).toBe(1);
    expect(body2.updated).toBe(1);
  });

  test('batch import triggers reference detection', async ({ request }) => {
    test.setTimeout(30000);

    // Clean up first, then create skills with cross-references
    await deleteSkillsByPrefix(request, token, `${TEST_PREFIX}ref-`);

    const res = await request.post(`${API}/api/skills/batch`, {
      headers: authHeaders(token),
      data: [
        {
          name: `${TEST_PREFIX}ref-base`,
          description: 'Base skill',
          content: 'This is the base skill that others depend on.',
        },
        {
          name: `${TEST_PREFIX}ref-dependent`,
          description: 'Dependent skill',
          content: `This skill uses ${TEST_PREFIX}ref-base for its operation.`,
        },
      ],
    });
    expect(res.status()).toBe(200);

    // Fetch the skills to get the dependent's ID
    const listRes = await request.get(`${API}/api/skills`, {
      headers: authHeaders(token),
    });
    const skills: { id: string; name: string }[] = await listRes.json();
    const dependent = skills.find(
      (s) => s.name === `${TEST_PREFIX}ref-dependent`,
    );
    expect(dependent).toBeTruthy();

    // Check references for the dependent skill
    const refRes = await request.get(
      `${API}/api/skills/${dependent!.id}/references`,
      { headers: authHeaders(token) },
    );
    expect(refRes.status()).toBe(200);
    const refs = await refRes.json();
    expect(refs.outgoing).toContain(`${TEST_PREFIX}ref-base`);
  });
});

// ─── 3. Batch Actions via API ────────────────────────────

test.describe.serial('Batch Actions via API', () => {
  const TEST_PREFIX = 'e2e-action-';
  let token: string;
  let skillIds: string[] = [];

  test.beforeAll(async ({ request }) => {
    token = await getAdminToken(request);
    await deleteSkillsByPrefix(request, token, TEST_PREFIX);

    // Create 2 skills for batch action testing
    const res = await request.post(`${API}/api/skills/batch`, {
      headers: authHeaders(token),
      data: [
        {
          name: `${TEST_PREFIX}one`,
          description: 'Skill one',
          content: 'Content one.',
        },
        {
          name: `${TEST_PREFIX}two`,
          description: 'Skill two',
          content: 'Content two.',
        },
      ],
    });
    expect(res.status()).toBe(200);

    // Get IDs
    const listRes = await request.get(`${API}/api/skills`, {
      headers: authHeaders(token),
    });
    const skills: { id: string; name: string }[] = await listRes.json();
    skillIds = skills
      .filter((s) => s.name.startsWith(TEST_PREFIX))
      .map((s) => s.id);
    expect(skillIds.length).toBe(2);
  });

  test.afterAll(async ({ request }) => {
    await deleteSkillsByPrefix(request, token, TEST_PREFIX);
  });

  test('batch disable skills', async ({ request }) => {
    test.setTimeout(30000);
    const res = await request.post(`${API}/api/skills/batch-action`, {
      headers: authHeaders(token),
      data: { ids: skillIds, action: 'disable' },
    });
    expect(res.status()).toBe(200);

    // Verify both are disabled
    const listRes = await request.get(`${API}/api/skills`, {
      headers: authHeaders(token),
    });
    const skills: { id: string; name: string; enabled: boolean }[] =
      await listRes.json();
    for (const id of skillIds) {
      const skill = skills.find((s) => s.id === id);
      expect(skill).toBeTruthy();
      expect(skill!.enabled).toBe(false);
    }
  });

  test('batch enable skills', async ({ request }) => {
    test.setTimeout(30000);
    const res = await request.post(`${API}/api/skills/batch-action`, {
      headers: authHeaders(token),
      data: { ids: skillIds, action: 'enable' },
    });
    expect(res.status()).toBe(200);

    // Verify both are enabled
    const listRes = await request.get(`${API}/api/skills`, {
      headers: authHeaders(token),
    });
    const skills: { id: string; name: string; enabled: boolean }[] =
      await listRes.json();
    for (const id of skillIds) {
      const skill = skills.find((s) => s.id === id);
      expect(skill).toBeTruthy();
      expect(skill!.enabled).toBe(true);
    }
  });

  test('batch delete skills', async ({ request }) => {
    test.setTimeout(30000);
    const res = await request.post(`${API}/api/skills/batch-action`, {
      headers: authHeaders(token),
      data: { ids: skillIds, action: 'delete' },
    });
    expect(res.status()).toBe(200);

    // Verify skills are gone
    const listRes = await request.get(`${API}/api/skills`, {
      headers: authHeaders(token),
    });
    const skills: { id: string; name: string }[] = await listRes.json();
    for (const id of skillIds) {
      expect(skills.find((s) => s.id === id)).toBeFalsy();
    }

    // Clear IDs so afterAll doesn't try to delete again
    skillIds = [];
  });
});

// ─── 4. Reference Graph API ─────────────────────────────

test.describe.serial('Reference Graph API', () => {
  const TEST_PREFIX = 'e2e-graph-';
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAdminToken(request);
    await deleteSkillsByPrefix(request, token, TEST_PREFIX);
  });

  test.afterAll(async ({ request }) => {
    await deleteSkillsByPrefix(request, token, TEST_PREFIX);
  });

  test('skill graph returns nodes and edges', async ({ request }) => {
    test.setTimeout(30000);

    // Create skills with cross-references
    const res = await request.post(`${API}/api/skills/batch`, {
      headers: authHeaders(token),
      data: [
        {
          name: `${TEST_PREFIX}core`,
          description: 'Core skill',
          content: 'Core functionality.',
        },
        {
          name: `${TEST_PREFIX}feature`,
          description: 'Feature skill',
          content: `This feature depends on ${TEST_PREFIX}core for base logic.`,
        },
        {
          name: `${TEST_PREFIX}integration`,
          description: 'Integration skill',
          content: `Integrates ${TEST_PREFIX}core and ${TEST_PREFIX}feature together.`,
        },
      ],
    });
    expect(res.status()).toBe(200);

    // Fetch the graph
    const graphRes = await request.get(`${API}/api/skills/graph`, {
      headers: authHeaders(token),
    });
    expect(graphRes.status()).toBe(200);
    const graph = await graphRes.json();

    // Verify nodes exist
    expect(graph.nodes).toBeDefined();
    expect(Array.isArray(graph.nodes)).toBe(true);
    const nodeNames = graph.nodes.map((n: { name: string }) => n.name);
    expect(nodeNames).toContain(`${TEST_PREFIX}core`);
    expect(nodeNames).toContain(`${TEST_PREFIX}feature`);
    expect(nodeNames).toContain(`${TEST_PREFIX}integration`);

    // Verify edges exist (integration -> core, integration -> feature, feature -> core)
    expect(graph.edges).toBeDefined();
    expect(Array.isArray(graph.edges)).toBe(true);
    expect(graph.edges.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── 5. UI — Batch Operations ────────────────────────────

test.describe('UI — Skill Batch Operations', () => {
  const TEST_PREFIX = 'e2e-ui-batch-';
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAdminToken(request);
    await deleteSkillsByPrefix(request, token, TEST_PREFIX);

    // Seed skills for UI tests
    await request.post(`${API}/api/skills/batch`, {
      headers: authHeaders(token),
      data: [
        {
          name: `${TEST_PREFIX}skill-a`,
          description: 'UI test skill A',
          content: 'Skill A content.',
        },
        {
          name: `${TEST_PREFIX}skill-b`,
          description: 'UI test skill B',
          content: 'Skill B content.',
        },
        {
          name: `${TEST_PREFIX}skill-c`,
          description: 'UI test skill C',
          content: 'Skill C content.',
        },
      ],
    });
  });

  test.afterAll(async ({ request }) => {
    await deleteSkillsByPrefix(request, token, TEST_PREFIX);
  });

  test('select all checkbox and batch action bar', async ({ page }) => {
    test.setTimeout(30000);

    // Navigate to settings and authenticate
    await page.goto('/settings', { waitUntil: 'networkidle', timeout: 30000 });

    // Handle login
    const loginInput = page.getByTestId('login-password');
    if (await loginInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await loginInput.fill(ADMIN_PASSWORD);
      await page.getByTestId('login-submit').click();
      await expect(page.getByText('Gemini API Keys')).toBeVisible({
        timeout: 10000,
      });
    }

    // Scroll to Agent Skills section
    const skillsHeading = page.getByText('Agent Skills');
    await expect(skillsHeading).toBeVisible({ timeout: 10000 });
    await skillsHeading.scrollIntoViewIfNeeded();

    // Wait for skills to load
    await page.waitForTimeout(1000);

    // Click the select-all checkbox
    const selectAll = page.getByTestId('skill-select-all');
    await expect(selectAll).toBeVisible({ timeout: 5000 });
    await selectAll.click();

    // Verify the batch action bar appears
    const batchBar = page.getByTestId('skill-batch-action-bar');
    await expect(batchBar).toBeVisible({ timeout: 5000 });

    // Verify the count is shown (e.g. "(3 已選)" or similar)
    await expect(batchBar).toContainText('已選');

    // Verify action buttons are present
    await expect(
      batchBar.getByRole('button', { name: /停用|啟用/ }),
    ).toBeVisible();
    await expect(
      batchBar.getByRole('button', { name: /刪除/ }),
    ).toBeVisible();

    // Deselect all
    await selectAll.click();

    // Batch action bar should disappear
    await expect(batchBar).not.toBeVisible({ timeout: 5000 });
  });
});
