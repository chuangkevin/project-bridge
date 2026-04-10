import { McpServerRecord } from './mcpRegistry';

interface JsonRpcSuccess<T> {
  jsonrpc: '2.0';
  id: string | number;
  result: T;
}

interface JsonRpcError {
  jsonrpc: '2.0';
  id: string | number | null;
  error: { code: number; message: string; data?: unknown };
}

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcError;

export interface McpServerTestResult {
  ok: boolean;
  serverInfo?: { name?: string; version?: string };
  protocolVersion?: string;
  error?: string;
}

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

interface JsonRpcEnvelope<T> {
  result: T;
  sessionId: string | null;
}

function parseSsePayload<T>(raw: string): JsonRpcResponse<T> {
  const events = raw.split(/\r?\n\r?\n/);
  for (const event of events) {
    const data = event
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trim())
      .join('\n')
      .trim();
    if (!data) continue;
    try {
      return JSON.parse(data) as JsonRpcResponse<T>;
    } catch {
      continue;
    }
  }
  throw new Error(`Invalid MCP SSE response: ${raw.slice(0, 200)}`);
}

function buildHeaders(sessionId?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'MCP-Protocol-Version': '2024-11-05',
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  return headers;
}

async function sendJsonRpc<T>(
  server: McpServerRecord,
  method: string,
  params: Record<string, unknown>,
  sessionId?: string | null
): Promise<JsonRpcEnvelope<T>> {
  const response = await fetch(server.endpoint, {
    method: 'POST',
    headers: buildHeaders(sessionId),
    body: JSON.stringify({ jsonrpc: '2.0', id: `${method}-${Date.now()}`, method, params }),
    signal: AbortSignal.timeout(server.timeoutMs),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  let payload: JsonRpcResponse<T>;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream')) {
    payload = parseSsePayload<T>(text);
  } else {
    try {
      payload = JSON.parse(text) as JsonRpcResponse<T>;
    } catch {
      throw new Error(`Invalid MCP response: ${text.slice(0, 200)}`);
    }
  }

  if ('error' in payload) {
    throw new Error(payload.error.message || 'MCP returned an error');
  }

  return {
    result: payload.result,
    sessionId: response.headers.get('mcp-session-id') || response.headers.get('Mcp-Session-Id'),
  };
}

async function sendNotification(
  server: McpServerRecord,
  method: string,
  params: Record<string, unknown>,
  sessionId?: string | null
): Promise<void> {
  const response = await fetch(server.endpoint, {
    method: 'POST',
    headers: buildHeaders(sessionId),
    body: JSON.stringify({ jsonrpc: '2.0', method, params }),
    signal: AbortSignal.timeout(server.timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
}

async function initializeSession(server: McpServerRecord): Promise<JsonRpcEnvelope<any>> {
  const init = await sendJsonRpc<any>(server, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'project-bridge', version: '1.0.0' },
  });

  await sendNotification(server, 'notifications/initialized', {}, init.sessionId);
  return init;
}

export async function testMcpServer(server: McpServerRecord): Promise<McpServerTestResult> {
  try {
    const initialized = await initializeSession(server);
    const result = initialized.result;

    return {
      ok: true,
      serverInfo: result?.serverInfo,
      protocolVersion: result?.protocolVersion,
    };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Unknown MCP error' };
  }
}

export async function listMcpTools(server: McpServerRecord): Promise<McpToolInfo[]> {
  const initialized = await initializeSession(server);
  const { result } = await sendJsonRpc<any>(server, 'tools/list', {}, initialized.sessionId);
  const tools = Array.isArray(result?.tools) ? result.tools : [];
  return tools
    .filter((tool: any) => tool && typeof tool.name === 'string')
    .map((tool: any) => ({
      name: tool.name,
      description: typeof tool.description === 'string' ? tool.description : '',
      inputSchema: tool.inputSchema,
    }));
}

export async function callMcpTool(server: McpServerRecord, toolName: string, args: Record<string, unknown>): Promise<unknown> {
  const initialized = await initializeSession(server);
  const { result } = await sendJsonRpc<any>(server, 'tools/call', {
    name: toolName,
    arguments: args,
  }, initialized.sessionId);
  return result;
}
