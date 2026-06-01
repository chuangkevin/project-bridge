import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export type McpServerConfig =
  | { name: string; command: string; args?: string[]; env?: Record<string, string>; transport: 'stdio' }
  | { name: string; url: string; transport: 'http' };

export interface McpToolDescriptor { name: string; description?: string; }

export interface ConnectedMcp {
  config: McpServerConfig;
  client: Client;
  tools: McpToolDescriptor[];
}

export async function connectMcp(config: McpServerConfig): Promise<ConnectedMcp> {
  const client = new Client({ name: 'designbridge', version: '2.0.0' }, { capabilities: {} });
  if (config.transport === 'stdio') {
    const transport = new StdioClientTransport({ command: config.command, args: config.args, env: config.env });
    await client.connect(transport);
  } else {
    throw new Error('HTTP transport not yet wired in M1');
  }
  const toolList = await client.listTools();
  return { config, client, tools: toolList.tools.map(t => ({ name: t.name, description: t.description })) };
}

export async function disconnectMcp(c: ConnectedMcp): Promise<void> {
  await c.client.close();
}

export async function callMcpTool(c: ConnectedMcp, name: string, args: Record<string, unknown>): Promise<unknown> {
  const r = await c.client.callTool({ name, arguments: args });
  return r;
}
