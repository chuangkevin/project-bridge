import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
const cli = resolve(__dirname, '../bin/verify-rules.ts');
const fx = resolve(__dirname, 'fixtures');
const run = (f: string) => execSync(`pnpm exec tsx "${cli}" "${resolve(fx, f)}"`, { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });

describe('verify-rules CLI', () => {
  it('exits 0 on valid rules', () => { expect(run('valid.rules.json')).toMatch(/OK/); }, 30000);
  it('exits non-zero on shape errors', () => { expect(() => run('invalid-shape.rules.json')).toThrow(); }, 30000);
  it('exits non-zero on conflicts', () => { expect(() => run('conflict.rules.json')).toThrow(); }, 30000);
  it('exits non-zero on dead rules', () => { expect(() => run('dead.rules.json')).toThrow(); }, 30000);
});
