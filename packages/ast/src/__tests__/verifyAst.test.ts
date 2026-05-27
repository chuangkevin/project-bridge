import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const cli = resolve(__dirname, '../bin/verify-ast.ts');
const fixtures = resolve(__dirname, 'fixtures');
// `pnpm exec tsx` resolves the local tsx devDep without npm's slow per-call
// package resolution (`npx tsx` cold-starts at 7-10s on Windows, blowing the
// default 5s vitest timeout). The CLI is run as a real subprocess so the
// fixture-driven exit codes match what the pre-commit hook will see.
const tsxRun = (args: string) =>
  execSync(`pnpm exec tsx "${cli}" ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// Each case spawns a real tsx subprocess; cold-start under the parallel suite
// can exceed vitest's 5s default, so give every case generous headroom.
const SUBPROCESS_TIMEOUT_MS = 30_000;

describe('verify-ast CLI', () => {
  it('exits 0 on valid AST and prints OK', () => {
    const out = tsxRun(`"${resolve(fixtures, 'valid.ast.json')}"`);
    expect(out).toMatch(/OK/);
  }, SUBPROCESS_TIMEOUT_MS);

  it('exits non-zero on invalid schemaVersion', () => {
    expect(() => tsxRun(`"${resolve(fixtures, 'invalid-schema-version.ast.json')}"`)).toThrow();
  }, SUBPROCESS_TIMEOUT_MS);

  it('exits non-zero on unknown component type', () => {
    expect(() => tsxRun(`"${resolve(fixtures, 'invalid-unknown-type.ast.json')}"`)).toThrow();
  }, SUBPROCESS_TIMEOUT_MS);

  it('exits non-zero when no file argument passed', () => {
    expect(() => tsxRun('')).toThrow();
  }, SUBPROCESS_TIMEOUT_MS);
});
