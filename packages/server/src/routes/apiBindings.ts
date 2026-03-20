import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection';

const router = Router();

const VALID_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

// GET /api/projects/:id/api-bindings — list all bindings for project
router.get('/:id/api-bindings', (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const bindings = db.prepare(
      'SELECT * FROM api_bindings WHERE project_id = ? ORDER BY created_at ASC'
    ).all(projectId);

    return res.json(bindings.map(formatBinding));
  } catch (err: any) {
    console.error('Error listing api bindings:', err);
    return res.status(500).json({ error: 'Failed to list api bindings' });
  }
});

// POST /api/projects/:id/api-bindings — create binding
router.post('/:id/api-bindings', (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { bridgeId, method, url, params, responseSchema, fieldMappings } = req.body;

    if (!bridgeId || typeof bridgeId !== 'string') {
      return res.status(400).json({ error: 'bridgeId is required' });
    }

    const m = (method || 'GET').toUpperCase();
    if (!VALID_METHODS.includes(m)) {
      return res.status(400).json({ error: `method must be one of ${VALID_METHODS.join(', ')}` });
    }

    // Validate JSON fields
    const paramsJson = safeJson(params, '[]');
    const responseSchemaJson = safeJson(responseSchema, '{}');
    const fieldMappingsJson = safeJson(fieldMappings, '[]');

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO api_bindings (id, project_id, bridge_id, method, url, params, response_schema, field_mappings, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, projectId, bridgeId, m, url || '', paramsJson, responseSchemaJson, fieldMappingsJson, now, now);

    const row = db.prepare('SELECT * FROM api_bindings WHERE id = ?').get(id);
    return res.status(201).json(formatBinding(row));
  } catch (err: any) {
    console.error('Error creating api binding:', err);
    return res.status(500).json({ error: 'Failed to create api binding' });
  }
});

// PUT /api/projects/:id/api-bindings/:bindingId — update binding
router.put('/:id/api-bindings/:bindingId', (req: Request, res: Response) => {
  try {
    const { id: projectId, bindingId } = req.params;
    const existing = db.prepare(
      'SELECT * FROM api_bindings WHERE id = ? AND project_id = ?'
    ).get(bindingId, projectId);
    if (!existing) return res.status(404).json({ error: 'Binding not found' });

    const { method, url, params, responseSchema, fieldMappings } = req.body;

    const m = method ? method.toUpperCase() : (existing as any).method;
    if (method && !VALID_METHODS.includes(m)) {
      return res.status(400).json({ error: `method must be one of ${VALID_METHODS.join(', ')}` });
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE api_bindings SET method = ?, url = ?, params = ?, response_schema = ?, field_mappings = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      m,
      url !== undefined ? url : (existing as any).url,
      params !== undefined ? safeJson(params, (existing as any).params) : (existing as any).params,
      responseSchema !== undefined ? safeJson(responseSchema, (existing as any).response_schema) : (existing as any).response_schema,
      fieldMappings !== undefined ? safeJson(fieldMappings, (existing as any).field_mappings) : (existing as any).field_mappings,
      now,
      bindingId
    );

    const row = db.prepare('SELECT * FROM api_bindings WHERE id = ?').get(bindingId);
    return res.json(formatBinding(row));
  } catch (err: any) {
    console.error('Error updating api binding:', err);
    return res.status(500).json({ error: 'Failed to update api binding' });
  }
});

// DELETE /api/projects/:id/api-bindings/:bindingId — delete binding
router.delete('/:id/api-bindings/:bindingId', (req: Request, res: Response) => {
  try {
    const { id: projectId, bindingId } = req.params;
    const existing = db.prepare(
      'SELECT * FROM api_bindings WHERE id = ? AND project_id = ?'
    ).get(bindingId, projectId);
    if (!existing) return res.status(404).json({ error: 'Binding not found' });

    const bridgeId = (existing as any).bridge_id;

    // Delete associated component dependencies
    db.prepare(
      'DELETE FROM component_dependencies WHERE project_id = ? AND (source_bridge_id = ? OR target_bridge_id = ?)'
    ).run(projectId, bridgeId, bridgeId);

    db.prepare('DELETE FROM api_bindings WHERE id = ?').run(bindingId);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting api binding:', err);
    return res.status(500).json({ error: 'Failed to delete api binding' });
  }
});

// GET /api/projects/:id/api-bindings/export — export all bindings, dependencies, constraints as structured JSON
router.get('/:id/api-bindings/export', (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(projectId) as any;
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const bindings = db.prepare(
      'SELECT * FROM api_bindings WHERE project_id = ? ORDER BY created_at ASC'
    ).all(projectId) as any[];

    const dependencies = db.prepare(
      'SELECT * FROM component_dependencies WHERE project_id = ? ORDER BY created_at ASC'
    ).all(projectId) as any[];

    const constraints = db.prepare(
      'SELECT * FROM element_constraints WHERE project_id = ? ORDER BY created_at ASC'
    ).all(projectId) as any[];

    // Build constraint map by bridge_id
    const constraintMap: Record<string, any> = {};
    for (const c of constraints) {
      constraintMap[c.bridge_id] = {
        constraintType: c.constraint_type,
        min: c.min,
        max: c.max,
        pattern: c.pattern,
        required: !!c.required,
        errorMessage: c.error_message,
      };
    }

    // Build dependency maps
    const outgoingDepsMap: Record<string, any[]> = {};
    const incomingDepsMap: Record<string, any[]> = {};
    for (const d of dependencies) {
      if (!outgoingDepsMap[d.source_bridge_id]) outgoingDepsMap[d.source_bridge_id] = [];
      outgoingDepsMap[d.source_bridge_id].push({
        targetBridgeId: d.target_bridge_id,
        trigger: d.trigger_event,
        action: d.action,
      });
      if (!incomingDepsMap[d.target_bridge_id]) incomingDepsMap[d.target_bridge_id] = [];
      incomingDepsMap[d.target_bridge_id].push({
        sourceBridgeId: d.source_bridge_id,
        trigger: d.trigger_event,
        action: d.action,
      });
    }

    // Group bindings by page (parse page prefix from bridge-id if present, e.g. "page1-btn" -> "page1")
    const pages: Record<string, any[]> = {};
    for (const b of bindings) {
      const pageName = extractPageFromBridgeId(b.bridge_id);
      if (!pages[pageName]) pages[pageName] = [];
      pages[pageName].push({
        bridgeId: b.bridge_id,
        method: b.method,
        url: b.url,
        params: safeParse(b.params, []),
        responseSchema: safeParse(b.response_schema, {}),
        fieldMappings: safeParse(b.field_mappings, []),
        outgoingDependencies: outgoingDepsMap[b.bridge_id] || [],
        incomingDependencies: incomingDepsMap[b.bridge_id] || [],
        constraint: constraintMap[b.bridge_id] || null,
      });
    }

    // Also add constraints for elements without bindings
    const boundBridgeIds = new Set(bindings.map((b: any) => b.bridge_id));
    const unboundConstraints: any[] = [];
    for (const c of constraints) {
      if (!boundBridgeIds.has(c.bridge_id)) {
        const pageName = extractPageFromBridgeId(c.bridge_id);
        if (!pages[pageName]) pages[pageName] = [];
        unboundConstraints.push({
          bridgeId: c.bridge_id,
          constraint: constraintMap[c.bridge_id],
          outgoingDependencies: outgoingDepsMap[c.bridge_id] || [],
          incomingDependencies: incomingDepsMap[c.bridge_id] || [],
        });
      }
    }

    return res.json({
      projectId,
      projectName: project.name,
      exportedAt: new Date().toISOString(),
      pages,
      unboundConstraints,
      summary: {
        totalBindings: bindings.length,
        totalDependencies: dependencies.length,
        totalConstraints: constraints.length,
      },
    });
  } catch (err: any) {
    console.error('Error exporting api bindings:', err);
    return res.status(500).json({ error: 'Failed to export api bindings' });
  }
});

function formatBinding(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    bridgeId: row.bridge_id,
    method: row.method,
    url: row.url,
    params: safeParse(row.params, []),
    responseSchema: safeParse(row.response_schema, {}),
    fieldMappings: safeParse(row.field_mappings, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeJson(value: any, fallback: string): string {
  if (typeof value === 'string') {
    try { JSON.parse(value); return value; } catch { return fallback; }
  }
  if (value !== undefined && value !== null) {
    try { return JSON.stringify(value); } catch { return fallback; }
  }
  return fallback;
}

function safeParse(value: string, fallback: any): any {
  try { return JSON.parse(value); } catch { return fallback; }
}

function extractPageFromBridgeId(bridgeId: string): string {
  // Attempt to extract page from bridge-id prefix like "page1-element" or "home-section-btn"
  // Default to "default" if no recognizable page prefix
  const match = bridgeId.match(/^(page\d+|home|login|dashboard|settings|profile|about|contact)/i);
  return match ? match[1] : 'default';
}

export default router;
