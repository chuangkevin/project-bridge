import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection';
import { injectConstraintAttributes } from '../services/constraintInjector';

const router = Router();

// GET /api/projects/:id/element-constraints — list all constraints for project
router.get('/:id/element-constraints', (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const constraints = db.prepare(
      'SELECT * FROM element_constraints WHERE project_id = ? ORDER BY created_at ASC'
    ).all(projectId);

    return res.json(constraints.map(formatConstraint));
  } catch (err: any) {
    console.error('Error listing element constraints:', err);
    return res.status(500).json({ error: 'Failed to list element constraints' });
  }
});

// POST /api/projects/:id/element-constraints — create or upsert constraint
router.post('/:id/element-constraints', (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { bridgeId, constraintType, min, max, pattern, required, errorMessage } = req.body;

    if (!bridgeId || typeof bridgeId !== 'string') {
      return res.status(400).json({ error: 'bridgeId is required' });
    }

    const now = new Date().toISOString();

    // Upsert: one constraint per bridge_id per project
    const existing = db.prepare(
      'SELECT id FROM element_constraints WHERE project_id = ? AND bridge_id = ?'
    ).get(projectId, bridgeId) as any;

    let constraintId: string;
    if (existing) {
      constraintId = existing.id;
      db.prepare(
        `UPDATE element_constraints SET constraint_type = ?, min = ?, max = ?, pattern = ?, required = ?, error_message = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        constraintType || 'text',
        min !== undefined && min !== null && min !== '' ? Number(min) : null,
        max !== undefined && max !== null && max !== '' ? Number(max) : null,
        pattern || null,
        required ? 1 : 0,
        errorMessage || null,
        now,
        constraintId
      );
    } else {
      constraintId = uuidv4();
      db.prepare(
        `INSERT INTO element_constraints (id, project_id, bridge_id, constraint_type, min, max, pattern, required, error_message, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        constraintId,
        projectId,
        bridgeId,
        constraintType || 'text',
        min !== undefined && min !== null && min !== '' ? Number(min) : null,
        max !== undefined && max !== null && max !== '' ? Number(max) : null,
        pattern || null,
        required ? 1 : 0,
        errorMessage || null,
        now,
        now
      );
    }

    // Inject constraint attributes into prototype HTML
    injectConstraintsIntoPrototype(projectId as string);

    const row = db.prepare('SELECT * FROM element_constraints WHERE id = ?').get(constraintId);
    return res.status(201).json(formatConstraint(row));
  } catch (err: any) {
    console.error('Error creating element constraint:', err);
    return res.status(500).json({ error: 'Failed to create element constraint' });
  }
});

// PUT /api/projects/:id/element-constraints/:constraintId — update constraint
router.put('/:id/element-constraints/:constraintId', (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const constraintId = req.params.constraintId as string;
    const existing = db.prepare(
      'SELECT * FROM element_constraints WHERE id = ? AND project_id = ?'
    ).get(constraintId, projectId) as any;
    if (!existing) return res.status(404).json({ error: 'Constraint not found' });

    const { constraintType, min, max, pattern, required, errorMessage } = req.body;
    const now = new Date().toISOString();

    db.prepare(
      `UPDATE element_constraints SET constraint_type = ?, min = ?, max = ?, pattern = ?, required = ?, error_message = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      constraintType !== undefined ? constraintType : existing.constraint_type,
      min !== undefined ? (min !== null && min !== '' ? Number(min) : null) : existing.min,
      max !== undefined ? (max !== null && max !== '' ? Number(max) : null) : existing.max,
      pattern !== undefined ? (pattern || null) : existing.pattern,
      required !== undefined ? (required ? 1 : 0) : existing.required,
      errorMessage !== undefined ? (errorMessage || null) : existing.error_message,
      now,
      constraintId
    );

    // Inject constraint attributes into prototype HTML
    injectConstraintsIntoPrototype(projectId as string);

    const row = db.prepare('SELECT * FROM element_constraints WHERE id = ?').get(constraintId);
    return res.json(formatConstraint(row));
  } catch (err: any) {
    console.error('Error updating element constraint:', err);
    return res.status(500).json({ error: 'Failed to update element constraint' });
  }
});

// DELETE /api/projects/:id/element-constraints/:constraintId — delete constraint
router.delete('/:id/element-constraints/:constraintId', (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const constraintId = req.params.constraintId as string;
    const existing = db.prepare(
      'SELECT * FROM element_constraints WHERE id = ? AND project_id = ?'
    ).get(constraintId, projectId);
    if (!existing) return res.status(404).json({ error: 'Constraint not found' });

    db.prepare('DELETE FROM element_constraints WHERE id = ?').run(constraintId);

    // Re-inject to remove stale attributes
    injectConstraintsIntoPrototype(projectId as string);

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting element constraint:', err);
    return res.status(500).json({ error: 'Failed to delete element constraint' });
  }
});

function formatConstraint(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    bridgeId: row.bridge_id,
    constraintType: row.constraint_type,
    min: row.min,
    max: row.max,
    pattern: row.pattern,
    required: !!row.required,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function injectConstraintsIntoPrototype(projectId: string): void {
  try {
    const version = db.prepare(
      'SELECT id, html FROM prototype_versions WHERE project_id = ? AND is_current = 1'
    ).get(projectId) as { id: string; html: string } | undefined;
    if (!version) return;

    const constraints = db.prepare(
      'SELECT * FROM element_constraints WHERE project_id = ?'
    ).all(projectId) as any[];

    const updatedHtml = injectConstraintAttributes(version.html, constraints);
    if (updatedHtml !== version.html) {
      db.prepare('UPDATE prototype_versions SET html = ? WHERE id = ?').run(updatedHtml, version.id);
    }
  } catch (err) {
    console.error('Error injecting constraints into prototype:', err);
  }
}

export default router;
