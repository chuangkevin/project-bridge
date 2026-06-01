import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPlugins } from '../pluginLoader';

let baseDir: string;
let pluginsDir: string;

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), 'pl-'));
  pluginsDir = join(baseDir, 'plugins');
  mkdirSync(pluginsDir, { recursive: true });
});
afterEach(() => { rmSync(baseDir, { recursive: true, force: true }); });

describe('loadPlugins', () => {
  it('returns empty list when no plugins', () => {
    expect(loadPlugins(pluginsDir)).toEqual([]);
  });

  it('reads plugin.json from each plugin dir', () => {
    mkdirSync(join(pluginsDir, 'a'));
    writeFileSync(join(pluginsDir, 'a', 'plugin.json'), JSON.stringify({
      name: 'a', version: '1.0.0', description: 'Plugin A',
    }));
    const r = loadPlugins(pluginsDir);
    expect(r).toHaveLength(1);
    expect(r[0].manifest.name).toBe('a');
  });

  it('aggregates mcpServers across plugins', () => {
    mkdirSync(join(pluginsDir, 'a'));
    mkdirSync(join(pluginsDir, 'b'));
    writeFileSync(join(pluginsDir, 'a', 'plugin.json'), JSON.stringify({
      name: 'a', version: '1.0.0',
      mcpServers: { svrA: { transport: 'stdio', command: 'echo' } },
    }));
    writeFileSync(join(pluginsDir, 'b', 'plugin.json'), JSON.stringify({
      name: 'b', version: '1.0.0',
      mcpServers: { svrB: { transport: 'stdio', command: 'cat' } },
    }));
    const r = loadPlugins(pluginsDir);
    const allMcp = r.flatMap(p => p.mcpServers);
    expect(allMcp.map(s => s.name).sort()).toEqual(['svrA', 'svrB']);
  });

  it('silently skips plugin with malformed plugin.json', () => {
    mkdirSync(join(pluginsDir, 'bad'));
    writeFileSync(join(pluginsDir, 'bad', 'plugin.json'), '{{ not json');
    expect(loadPlugins(pluginsDir)).toEqual([]);
  });
});
