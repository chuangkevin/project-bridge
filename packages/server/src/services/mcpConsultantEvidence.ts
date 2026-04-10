import { callMcpTool, listMcpTools, McpToolInfo } from './mcpHttpClient';
import { listEnabledMcpServers, McpServerRecord } from './mcpRegistry';

interface McpEvidenceItem {
  server: string;
  tool: string;
  summary: string;
  raw: unknown;
}

export interface ConsultantMcpEvidence {
  block: string;
  items: McpEvidenceItem[];
}

const MAX_MCP_TOOL_CALLS_PER_ANSWER = 3;

interface ToolBudget {
  remaining: number;
}

function extractTableCandidates(message: string): string[] {
  const candidates = new Set<string>();

  for (const match of message.matchAll(/[`"']([A-Za-z][A-Za-z0-9_]{2,})[`"']/g)) {
    candidates.add(match[1]);
  }

  for (const match of message.matchAll(/(?:table|schema|資料表|欄位)(?:\s+(?:of|for|is|the))?[^A-Za-z0-9_]+([A-Za-z][A-Za-z0-9_]{2,})/gi)) {
    candidates.add(match[1]);
  }

  for (const match of message.matchAll(/\b([A-Z][A-Za-z0-9_]{2,}|[A-Za-z0-9]+_[A-Za-z0-9_]+)\b/g)) {
    candidates.add(match[1]);
  }

  return Array.from(candidates).slice(0, 3);
}

function normalizeAllowed(server: McpServerRecord, tools: McpToolInfo[]): McpToolInfo[] {
  if (server.allowedTools.length === 0) return [];
  const allowed = new Set(server.allowedTools);
  return tools.filter(tool => allowed.has(tool.name));
}

function isSchemaQuestion(message: string): boolean {
  return /schema|table|資料表|欄位|sql|db|資料庫/i.test(message);
}

async function tryGetTableSchema(server: McpServerRecord, toolName: string, tableName: string, budget: ToolBudget): Promise<unknown> {
  const payloads = [
    { tableName },
    { table: tableName },
    { name: tableName },
  ];

  let lastError: unknown;
  for (const payload of payloads) {
    if (budget.remaining <= 0) {
      throw lastError instanceof Error ? lastError : new Error('MCP tool-call budget exhausted');
    }
    try {
      budget.remaining -= 1;
      return await callMcpTool(server, toolName, payload);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unable to get table schema');
}

function summarizeResult(result: unknown): string {
  const text = typeof result === 'string' ? result : JSON.stringify(result);
  return text.length > 500 ? text.slice(0, 500) + '...' : text;
}

export async function gatherConsultantMcpEvidence(message: string, mode: string): Promise<ConsultantMcpEvidence | null> {
  if (!['spec-review', 'architecture-review'].includes(mode)) return null;
  if (!isSchemaQuestion(message)) return null;

  const servers = listEnabledMcpServers('consultant');
  if (servers.length === 0) return null;

  const evidence: McpEvidenceItem[] = [];
  const failures: string[] = [];
  const tableCandidates = extractTableCandidates(message);
  const budget: ToolBudget = { remaining: MAX_MCP_TOOL_CALLS_PER_ANSWER };

  for (const server of servers) {
    let tools: McpToolInfo[] = [];
    try {
      tools = normalizeAllowed(server, await listMcpTools(server));
    } catch (error: any) {
      failures.push(`[${server.name}] tools/list failed: ${error?.message || 'unknown error'}`);
      continue;
    }

    const schemaTool = tools.find(tool => /get-table-schema/i.test(tool.name));
    const listTool = tools.find(tool => /list-all-tables/i.test(tool.name));
    let serverEvidenceCount = 0;

    if (schemaTool && tableCandidates.length > 0) {
      for (const tableName of tableCandidates) {
        if (budget.remaining <= 0) break;
        try {
          const result = await tryGetTableSchema(server, schemaTool.name, tableName, budget);
          evidence.push({
            server: server.name,
            tool: schemaTool.name,
            summary: `${tableName}: ${summarizeResult(result)}`,
            raw: result,
          });
          serverEvidenceCount++;
        } catch {
          continue;
        }
      }
    }

    if (budget.remaining > 0 && serverEvidenceCount === 0 && listTool && /哪些表|有哪些表|list.*table|table list/i.test(message)) {
      try {
        budget.remaining -= 1;
        const result = await callMcpTool(server, listTool.name, {});
        evidence.push({
          server: server.name,
          tool: listTool.name,
          summary: summarizeResult(result),
          raw: result,
        });
        serverEvidenceCount++;
      } catch {
        continue;
      }
    }

    if (budget.remaining <= 0) break;
  }

  if (evidence.length === 0 && failures.length === 0) return null;

  let block = '';
  if (evidence.length > 0) {
    block += '=== MCP EVIDENCE ===\n';
    block += 'Use this as grounded evidence. Distinguish it from inference.\n';
    for (const item of evidence) {
      block += `- [${item.server}] ${item.tool}: ${item.summary}\n`;
    }
    block += '=== END MCP EVIDENCE ===';
  }

  if (failures.length > 0) {
    block += `${block ? '\n\n' : ''}=== MCP LIMITATIONS ===\n`;
    for (const failure of failures) {
      block += `- ${failure}\n`;
    }
    block += 'Treat these as tool failures, not evidence. If no MCP evidence is available, answer using documents/skills and mark uncertainty clearly.\n';
    block += '=== END MCP LIMITATIONS ===';
  }

  return { block, items: evidence };
}
