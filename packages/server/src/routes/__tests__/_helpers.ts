/**
 * Test helpers (M1 anonymous mode).
 *
 * Most M1 routes are anonymous (no Authorization header). The only auth
 * surface is admin-gated Settings operations, which use an in-memory admin
 * token minted by POST /api/auth/verify (after first-run POST /api/auth/setup).
 *
 * Helpers:
 *   - setupAdmin(app, password?) — first-run admin password set; returns admin token
 *   - asAdmin(token) — returns the Authorization header object for an admin request
 */

import type { Express } from 'express';
import request from 'supertest';

const DEFAULT_PASSWORD = 'pw12345678';

export async function setupAdmin(app: Express, password = DEFAULT_PASSWORD): Promise<string> {
  const r = await request(app).post('/api/auth/setup').send({ password });
  if (r.status !== 200) {
    throw new Error(`setup failed: ${r.status} ${JSON.stringify(r.body)}`);
  }
  return r.body.token as string;
}

export function asAdmin(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
