import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveTheme, loadTheme, type ThemeFile } from '../themeStore';

describe('themeStore', () => {
  let baseDir: string;
  beforeEach(() => { baseDir = mkdtempSync(join(tmpdir(), 'themestore-')); });

  it('loads null when no theme yet', () => {
    expect(loadTheme('p1', { baseDir })).toBeNull();
  });

  it('save then load round-trips', () => {
    const theme: ThemeFile = {
      schemaVersion: 1, updatedAt: 'x',
      palette: [{ value: '#abc' }],
      typography: { primaryFont: 'Inter', secondaryFont: null, headings: [], body: null },
      radius: ['4px'], shadow: [],
    };
    saveTheme('p1', theme, { baseDir });
    expect(loadTheme('p1', { baseDir })).toEqual(theme);
  });

  it('sanitizes projectId so nothing escapes baseDir', () => {
    const theme: ThemeFile = {
      schemaVersion: 1, updatedAt: 'x', palette: [],
      typography: { primaryFont: null, secondaryFont: null, headings: [], body: null },
      radius: [], shadow: [],
    };
    saveTheme('../../evil', theme, { baseDir });
    const escaped = join(baseDir, '..', '..', 'evil');
    expect(loadTheme('../../evil', { baseDir })).toEqual(theme);
    // Must not have written outside baseDir
    const fs = require('node:fs') as typeof import('node:fs');
    expect(fs.existsSync(escaped)).toBe(false);
  });
});
