import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('API: Endpoint Tagging - Full Pipeline', () => {
  const createdIds: string[] = [];

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

  // --- Phase 1: DB Schema ---
  test('Migration creates api_bindings, component_dependencies, element_constraints tables', async ({ request }) => {
    // Verify health endpoint works (means server started and ran migrations)
    const healthRes = await request.get(`${API}/api/health`);
    expect(healthRes.status()).toBe(200);

    // Create a project and try to use the new endpoints — if tables don't exist, these will 500
    const projRes = await request.post(`${API}/api/projects`, {
      data: { name: 'Schema Test' },
    });
    const project = await projRes.json();
    createdIds.push(project.id);

    const bindingsRes = await request.get(`${API}/api/projects/${project.id}/api-bindings`);
    expect(bindingsRes.status()).toBe(200);
    expect(await bindingsRes.json()).toEqual([]);

    const depsRes = await request.get(`${API}/api/projects/${project.id}/component-dependencies`);
    expect(depsRes.status()).toBe(200);
    expect(await depsRes.json()).toEqual([]);

    const constraintsRes = await request.get(`${API}/api/projects/${project.id}/element-constraints`);
    expect(constraintsRes.status()).toBe(200);
    expect(await constraintsRes.json()).toEqual([]);
  });

  // --- Phase 2: API Bindings CRUD ---
  test('API Bindings: create, list, update, delete', async ({ request }) => {
    const projRes = await request.post(`${API}/api/projects`, {
      data: { name: 'Bindings CRUD Test' },
    });
    const project = await projRes.json();
    createdIds.push(project.id);

    // POST create
    const createRes = await request.post(`${API}/api/projects/${project.id}/api-bindings`, {
      data: {
        bridgeId: 'submit-btn',
        method: 'POST',
        url: '/api/objects/batch',
        params: [{ name: 'ids', type: 'array', required: true }],
        responseSchema: { success: true, count: 0 },
        fieldMappings: [{ responseField: 'count', targetBridgeId: 'count-display' }],
      },
    });
    expect(createRes.status()).toBe(201);
    const binding = await createRes.json();
    expect(binding.id).toBeTruthy();
    expect(binding.bridgeId).toBe('submit-btn');
    expect(binding.method).toBe('POST');
    expect(binding.url).toBe('/api/objects/batch');
    expect(binding.params).toHaveLength(1);
    expect(binding.fieldMappings).toHaveLength(1);

    // GET list
    const listRes = await request.get(`${API}/api/projects/${project.id}/api-bindings`);
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    expect(list).toHaveLength(1);

    // PUT update
    const updateRes = await request.put(`${API}/api/projects/${project.id}/api-bindings/${binding.id}`, {
      data: { url: '/api/objects/batch?filter=active' },
    });
    expect(updateRes.status()).toBe(200);
    const updated = await updateRes.json();
    expect(updated.url).toBe('/api/objects/batch?filter=active');

    // DELETE
    const deleteRes = await request.delete(`${API}/api/projects/${project.id}/api-bindings/${binding.id}`);
    expect(deleteRes.status()).toBe(200);

    const listAfterDelete = await request.get(`${API}/api/projects/${project.id}/api-bindings`);
    expect((await listAfterDelete.json())).toHaveLength(0);
  });

  test('API Bindings: validation — bridgeId required', async ({ request }) => {
    const projRes = await request.post(`${API}/api/projects`, {
      data: { name: 'Binding Validation Test' },
    });
    const project = await projRes.json();
    createdIds.push(project.id);

    const res = await request.post(`${API}/api/projects/${project.id}/api-bindings`, {
      data: { method: 'GET', url: '/api/test' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('bridgeId');
  });

  test('API Bindings: method validation', async ({ request }) => {
    const projRes = await request.post(`${API}/api/projects`, {
      data: { name: 'Binding Method Test' },
    });
    const project = await projRes.json();
    createdIds.push(project.id);

    const res = await request.post(`${API}/api/projects/${project.id}/api-bindings`, {
      data: { bridgeId: 'test', method: 'INVALID' },
    });
    expect(res.status()).toBe(400);
  });

  // --- Phase 3: Component Dependencies CRUD ---
  test('Component Dependencies: create, list, update, delete', async ({ request }) => {
    const projRes = await request.post(`${API}/api/projects`, {
      data: { name: 'Dependencies CRUD Test' },
    });
    const project = await projRes.json();
    createdIds.push(project.id);

    // POST create
    const createRes = await request.post(`${API}/api/projects/${project.id}/component-dependencies`, {
      data: {
        sourceBridgeId: 'city-select',
        targetBridgeId: 'district-select',
        trigger: 'onChange',
        action: 'reload with ?city={value}',
      },
    });
    expect(createRes.status()).toBe(201);
    const dep = await createRes.json();
    expect(dep.sourceBridgeId).toBe('city-select');
    expect(dep.targetBridgeId).toBe('district-select');
    expect(dep.trigger).toBe('onChange');

    // GET list
    const listRes = await request.get(`${API}/api/projects/${project.id}/component-dependencies`);
    expect((await listRes.json())).toHaveLength(1);

    // PUT update
    const updateRes = await request.put(`${API}/api/projects/${project.id}/component-dependencies/${dep.id}`, {
      data: { action: 'reload with ?city={value}&region=north' },
    });
    expect(updateRes.status()).toBe(200);
    expect((await updateRes.json()).action).toBe('reload with ?city={value}&region=north');

    // DELETE
    const deleteRes = await request.delete(`${API}/api/projects/${project.id}/component-dependencies/${dep.id}`);
    expect(deleteRes.status()).toBe(200);
  });

  test('Component Dependencies: validation — sourceBridgeId required', async ({ request }) => {
    const projRes = await request.post(`${API}/api/projects`, {
      data: { name: 'Dep Validation Test' },
    });
    const project = await projRes.json();
    createdIds.push(project.id);

    const res = await request.post(`${API}/api/projects/${project.id}/component-dependencies`, {
      data: { targetBridgeId: 'target' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('sourceBridgeId');
  });

  // --- Phase 3: Element Constraints CRUD ---
  test('Element Constraints: create, list, update, delete with upsert', async ({ request }) => {
    const projRes = await request.post(`${API}/api/projects`, {
      data: { name: 'Constraints CRUD Test' },
    });
    const project = await projRes.json();
    createdIds.push(project.id);

    // POST create
    const createRes = await request.post(`${API}/api/projects/${project.id}/element-constraints`, {
      data: {
        bridgeId: 'ping-input',
        constraintType: 'number',
        min: 0,
        max: 10000,
        required: true,
        errorMessage: 'Must be 0-10000',
      },
    });
    expect(createRes.status()).toBe(201);
    const constraint = await createRes.json();
    expect(constraint.bridgeId).toBe('ping-input');
    expect(constraint.constraintType).toBe('number');
    expect(constraint.min).toBe(0);
    expect(constraint.max).toBe(10000);
    expect(constraint.required).toBe(true);

    // GET list
    const listRes = await request.get(`${API}/api/projects/${project.id}/element-constraints`);
    expect((await listRes.json())).toHaveLength(1);

    // POST upsert (same bridgeId)
    const upsertRes = await request.post(`${API}/api/projects/${project.id}/element-constraints`, {
      data: {
        bridgeId: 'ping-input',
        constraintType: 'number',
        min: 1,
        max: 5000,
      },
    });
    expect(upsertRes.status()).toBe(201);
    const upserted = await upsertRes.json();
    expect(upserted.min).toBe(1);
    expect(upserted.max).toBe(5000);
    // Still only one constraint for this bridgeId
    const listAfterUpsert = await request.get(`${API}/api/projects/${project.id}/element-constraints`);
    expect((await listAfterUpsert.json())).toHaveLength(1);

    // PUT update
    const updateRes = await request.put(`${API}/api/projects/${project.id}/element-constraints/${constraint.id}`, {
      data: { pattern: '^\\d+$', errorMessage: 'Digits only' },
    });
    expect(updateRes.status()).toBe(200);
    const updated = await updateRes.json();
    expect(updated.pattern).toBe('^\\d+$');
    expect(updated.errorMessage).toBe('Digits only');

    // DELETE
    const deleteRes = await request.delete(`${API}/api/projects/${project.id}/element-constraints/${constraint.id}`);
    expect(deleteRes.status()).toBe(200);
  });

  test('Element Constraints: validation — bridgeId required', async ({ request }) => {
    const projRes = await request.post(`${API}/api/projects`, {
      data: { name: 'Constraint Validation Test' },
    });
    const project = await projRes.json();
    createdIds.push(project.id);

    const res = await request.post(`${API}/api/projects/${project.id}/element-constraints`, {
      data: { constraintType: 'number', min: 0 },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('bridgeId');
  });

  // --- Phase 4: Export Endpoint ---
  test('Export: returns structured JSON with bindings, dependencies, constraints', async ({ request }) => {
    const projRes = await request.post(`${API}/api/projects`, {
      data: { name: 'Export Test' },
    });
    const project = await projRes.json();
    createdIds.push(project.id);

    // Create binding
    await request.post(`${API}/api/projects/${project.id}/api-bindings`, {
      data: {
        bridgeId: 'search-btn',
        method: 'GET',
        url: '/api/search',
        params: [{ name: 'q', type: 'string', required: true }],
        responseSchema: { results: [] },
        fieldMappings: [{ responseField: 'results[].name', targetBridgeId: 'result-name' }],
      },
    });

    // Create dependency
    await request.post(`${API}/api/projects/${project.id}/component-dependencies`, {
      data: {
        sourceBridgeId: 'search-btn',
        targetBridgeId: 'results-table',
        trigger: 'onClick',
        action: 'reload results',
      },
    });

    // Create constraint
    await request.post(`${API}/api/projects/${project.id}/element-constraints`, {
      data: {
        bridgeId: 'search-input',
        constraintType: 'text',
        required: true,
        errorMessage: 'Search query is required',
      },
    });

    // Export
    const exportRes = await request.get(`${API}/api/projects/${project.id}/api-bindings/export`);
    expect(exportRes.status()).toBe(200);
    const exported = await exportRes.json();

    expect(exported.projectId).toBe(project.id);
    expect(exported.summary.totalBindings).toBe(1);
    expect(exported.summary.totalDependencies).toBe(1);
    expect(exported.summary.totalConstraints).toBe(1);

    // Check binding in pages
    const pageKeys = Object.keys(exported.pages);
    expect(pageKeys.length).toBeGreaterThan(0);
    const firstPage = exported.pages[pageKeys[0]];
    expect(firstPage).toHaveLength(1);
    expect(firstPage[0].bridgeId).toBe('search-btn');
    expect(firstPage[0].outgoingDependencies).toHaveLength(1);
    expect(firstPage[0].outgoingDependencies[0].targetBridgeId).toBe('results-table');

    // Check unbound constraint
    expect(exported.unboundConstraints).toHaveLength(1);
    expect(exported.unboundConstraints[0].bridgeId).toBe('search-input');
    expect(exported.unboundConstraints[0].constraint.constraintType).toBe('text');
  });

  test('Export: empty project returns empty structure', async ({ request }) => {
    const projRes = await request.post(`${API}/api/projects`, {
      data: { name: 'Empty Export Test' },
    });
    const project = await projRes.json();
    createdIds.push(project.id);

    const exportRes = await request.get(`${API}/api/projects/${project.id}/api-bindings/export`);
    expect(exportRes.status()).toBe(200);
    const exported = await exportRes.json();
    expect(exported.summary.totalBindings).toBe(0);
    expect(exported.summary.totalDependencies).toBe(0);
    expect(exported.summary.totalConstraints).toBe(0);
  });

  // --- Phase 8: Full Pipeline E2E ---
  test('Full pipeline: create bindings + deps + constraints + export', async ({ request }) => {
    // Create project
    const projRes = await request.post(`${API}/api/projects`, {
      data: { name: 'Full Pipeline Test' },
    });
    const project = await projRes.json();
    createdIds.push(project.id);

    // Create bindings for city and district dropdowns
    const cityBindingRes = await request.post(`${API}/api/projects/${project.id}/api-bindings`, {
      data: {
        bridgeId: 'city-select',
        method: 'GET',
        url: '/api/cities',
        fieldMappings: [{ responseField: 'cities[].name', targetBridgeId: 'city-option' }],
      },
    });
    const cityBinding = await cityBindingRes.json();

    const districtBindingRes = await request.post(`${API}/api/projects/${project.id}/api-bindings`, {
      data: {
        bridgeId: 'district-select',
        method: 'GET',
        url: '/api/districts',
        params: [{ name: 'city', type: 'string', required: true }],
      },
    });
    await districtBindingRes.json();

    // Create dependency: city → district
    const depRes = await request.post(`${API}/api/projects/${project.id}/component-dependencies`, {
      data: {
        sourceBridgeId: 'city-select',
        targetBridgeId: 'district-select',
        trigger: 'onChange',
        action: 'reload with ?city={value}',
      },
    });
    await depRes.json();

    // Create constraint on price input
    await request.post(`${API}/api/projects/${project.id}/element-constraints`, {
      data: {
        bridgeId: 'price-input',
        constraintType: 'number',
        min: 0,
        max: 100000000,
        required: true,
        errorMessage: 'Price must be a positive number',
      },
    });

    // Add submit button binding
    await request.post(`${API}/api/projects/${project.id}/api-bindings`, {
      data: {
        bridgeId: 'submit-btn',
        method: 'POST',
        url: '/api/search',
        params: [
          { name: 'city', type: 'string', required: true },
          { name: 'district', type: 'string', required: false },
          { name: 'maxPrice', type: 'number', required: false },
        ],
        responseSchema: { results: [], total: 0 },
        fieldMappings: [
          { responseField: 'results[].title', targetBridgeId: 'result-title' },
          { responseField: 'results[].price', targetBridgeId: 'result-price' },
          { responseField: 'total', targetBridgeId: 'total-count' },
        ],
      },
    });

    // Export and verify full structure
    const exportRes = await request.get(`${API}/api/projects/${project.id}/api-bindings/export`);
    expect(exportRes.status()).toBe(200);
    const exported = await exportRes.json();

    expect(exported.summary.totalBindings).toBe(3);
    expect(exported.summary.totalDependencies).toBe(1);
    expect(exported.summary.totalConstraints).toBe(1);

    // Verify dependency is in export
    let foundDep = false;
    for (const pageBindings of Object.values(exported.pages) as any[][]) {
      for (const b of pageBindings) {
        if (b.bridgeId === 'city-select') {
          expect(b.outgoingDependencies).toHaveLength(1);
          expect(b.outgoingDependencies[0].targetBridgeId).toBe('district-select');
          foundDep = true;
        }
      }
    }
    expect(foundDep).toBe(true);

    // Delete a binding and verify dependencies are cleaned up
    const deleteRes = await request.delete(`${API}/api/projects/${project.id}/api-bindings/${cityBinding.id}`);
    expect(deleteRes.status()).toBe(200);

    // Dependencies involving city-select should be deleted
    const depsAfter = await request.get(`${API}/api/projects/${project.id}/component-dependencies`);
    const depsData = await depsAfter.json();
    const cityDeps = depsData.filter((d: any) => d.sourceBridgeId === 'city-select' || d.targetBridgeId === 'city-select');
    expect(cityDeps).toHaveLength(0);
  });
});
