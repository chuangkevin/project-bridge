import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock SDK before importing the registry
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'tool-a', description: 'an a' }] }),
    callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn(),
}));

import { initMcpRegistry, listMcpServers, callMcp, isConnected } from '../mcpRegistry';

beforeEach(async () => { await initMcpRegistry([]); });

describe('mcpRegistry', () => {
  it('listMcpServers empty initially', () => {
    expect(listMcpServers()).toEqual([]);
  });

  it('init connects + listMcpServers reflects them', async () => {
    await initMcpRegistry([{ name: 'a', command: 'echo', transport: 'stdio' }]);
    const list = listMcpServers();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('a');
    expect(list[0].tools).toEqual([{ name: 'tool-a', description: 'an a' }]);
  });

  it('isConnected true for connected server', async () => {
    await initMcpRegistry([{ name: 'a', command: 'echo', transport: 'stdio' }]);
    expect(isConnected('a')).toBe(true);
    expect(isConnected('nope')).toBe(false);
  });

  it('callMcp delegates to client.callTool', async () => {
    await initMcpRegistry([{ name: 'a', command: 'echo', transport: 'stdio' }]);
    const r = await callMcp('a', 'tool-a', { foo: 'bar' });
    expect(r).toEqual({ content: [{ type: 'text', text: 'ok' }] });
  });

  it('callMcp throws when server not connected', async () => {
    await expect(callMcp('missing', 'x', {})).rejects.toThrow();
  });
});
