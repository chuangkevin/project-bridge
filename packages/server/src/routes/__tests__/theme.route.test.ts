import { describe, it, expect, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createThemeRouter } from '../theme';

function buildApp(baseDir: string): Express {
  const app = express();
  app.use('/api/projects', createThemeRouter({ baseDir }));
  return app;
}

const sampleTheme = {
  schemaVersion: 1 as const, updatedAt: 'x',
  palette: [{ value: '#abc' }],
  typography: { primaryFont: 'Inter', secondaryFont: null, headings: [], body: null },
  radius: ['4px'], shadow: [],
};

const sampleProposal = {
  palette: [{ value: '#123456', source: 'https://e.com' }],
  typography: { primaryFont: 'Roboto', secondaryFont: null, headings: [], body: null },
  radius: ['8px'], shadow: ['none'], source: 'https://e.com',
};

describe('theme route', () => {
  let baseDir: string;
  let app: Express;
  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'theme-route-'));
    app = buildApp(baseDir);
  });

  it('GET returns null when no theme', async () => {
    const r = await request(app).get('/api/projects/p1/theme');
    expect(r.body.theme).toBeNull();
  });

  it('PUT writes and GET returns it', async () => {
    await request(app).put('/api/projects/p1/theme').send({ theme: sampleTheme }).expect(200);
    const r = await request(app).get('/api/projects/p1/theme');
    expect(r.body.theme).toMatchObject({ palette: [{ value: '#abc' }] });
  });

  it('PUT 400s when theme missing', async () => {
    const r = await request(app).put('/api/projects/p1/theme').send({});
    expect(r.status).toBe(400);
  });

  it('POST merge writes a merged theme from proposal + choice', async () => {
    await request(app).put('/api/projects/p1/theme').send({ theme: sampleTheme }).expect(200);
    const r = await request(app).post('/api/projects/p1/theme/merge').send({
      proposal: sampleProposal,
      choice: { palette: 'take-new', typography: 'keep', radius: 'union', shadow: 'union' },
    });
    expect(r.status).toBe(200);
    expect(r.body.theme.palette).toEqual([{ value: '#123456', source: 'https://e.com' }]);
    expect(r.body.theme.typography.primaryFont).toBe('Inter'); // kept
    expect(r.body.theme.radius.sort()).toEqual(['4px', '8px']);
  });

  it('POST merge 400s when proposal or choice missing', async () => {
    const r = await request(app).post('/api/projects/p1/theme/merge').send({ proposal: sampleProposal });
    expect(r.status).toBe(400);
  });
});
