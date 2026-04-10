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

const MAX_MCP_TOOL_CALLS_PER_ANSWER = 6;

interface ToolBudget {
  remaining: number;
}

function buildSchemaArgCandidates(tool: McpToolInfo, tableName: string): Array<Record<string, unknown>> {
  const props = (tool.inputSchema && typeof tool.inputSchema === 'object' && 'properties' in tool.inputSchema)
    ? (tool.inputSchema as { properties?: Record<string, unknown> }).properties || {}
    : {};
  const keys = ['table_name', 'tableName', 'table', 'name'].filter(key => key in props);
  if (keys.length === 0) {
    return [
      { table_name: tableName },
      { tableName },
      { table: tableName },
      { name: tableName },
    ];
  }
  return keys.map(key => ({ [key]: tableName }));
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[a.length][b.length];
}

function damerauLevenshtein(a: string, b: string): number {
  const da: Record<string, number> = {};
  const maxDist = a.length + b.length;
  const score = Array.from({ length: a.length + 2 }, () => new Array<number>(b.length + 2).fill(0));
  score[0][0] = maxDist;
  for (let i = 0; i <= a.length; i++) {
    score[i + 1][0] = maxDist;
    score[i + 1][1] = i;
  }
  for (let j = 0; j <= b.length; j++) {
    score[0][j + 1] = maxDist;
    score[1][j + 1] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    let db = 0;
    for (let j = 1; j <= b.length; j++) {
      const i1 = da[b[j - 1]] || 0;
      const j1 = db;
      let cost = 1;
      if (a[i - 1] === b[j - 1]) {
        cost = 0;
        db = j;
      }
      score[i + 1][j + 1] = Math.min(
        score[i][j] + cost,
        score[i + 1][j] + 1,
        score[i][j + 1] + 1,
        score[i1][j1] + (i - i1 - 1) + 1 + (j - j1 - 1),
      );
    }
    da[a[i - 1]] = i;
  }
  return score[a.length + 1][b.length + 1];
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

async function tryGetTableSchema(server: McpServerRecord, tool: McpToolInfo, tableName: string, budget: ToolBudget): Promise<unknown> {
  let lastError: unknown;
  for (const args of buildSchemaArgCandidates(tool, tableName)) {
    if (budget.remaining <= 0) throw lastError instanceof Error ? lastError : new Error('MCP tool-call budget exhausted');
    try {
      budget.remaining -= 1;
      return await callMcpTool(server, tool.name, args);
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

function isEmptySchemaResult(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const content = (result as { content?: unknown }).content;
  return Array.isArray(content) && content.length === 0;
}

function collectTableNames(value: unknown, names: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectTableNames(item, names);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  for (const [key, nested] of Object.entries(record)) {
    if ((key === 'TABLE_NAME' || key === 'table_name' || key === 'tableName') && typeof nested === 'string') {
      names.add(nested);
    } else {
      collectTableNames(nested, names);
    }
  }
}

function extractTableNamesFromListResult(result: any): string[] {
  const names = new Set<string>();
  collectTableNames(result, names);
  const content = Array.isArray(result?.content) ? result.content : [];
  for (const item of content) {
    if (!item || item.type !== 'text' || typeof item.text !== 'string') continue;
    try {
      collectTableNames(JSON.parse(item.text), names);
    } catch {
      continue;
    }
  }
  return Array.from(names);
}

function findClosestTableMatch(candidates: string[], actualTables: string[]): string | null {
  const matches: Array<{ name: string; score: number }> = [];
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeToken(candidate);
    if (!normalizedCandidate) continue;
    for (const actual of actualTables) {
      const normalizedActual = normalizeToken(actual);
      if (!normalizedActual) continue;
      let score = Number.MAX_SAFE_INTEGER;
      if (normalizedActual === normalizedCandidate) score = 0;
      else if (normalizedActual.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedActual)) score = 1;
      else score = damerauLevenshtein(normalizedCandidate, normalizedActual);
      matches.push({ name: actual, score });
    }
  }
  matches.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  if (matches.length === 0) return null;
  const [best, second] = matches;
  if (best.score > 1) return null;
  if (second && second.score === best.score && second.name !== best.name) return null;
  return best.name;
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
    let tableList: string[] | null = null;

    const ensureTableList = async (): Promise<string[]> => {
      if (tableList) return tableList;
      if (!listTool || budget.remaining <= 0) return [];
      try {
        budget.remaining -= 1;
        const result = await callMcpTool(server, listTool.name, {});
        tableList = extractTableNamesFromListResult(result);
        return tableList;
      } catch (error: any) {
        failures.push(`[${server.name}] ${listTool.name} failed: ${error?.message || 'unknown error'}`);
        tableList = [];
        return tableList;
      }
    };

    if (schemaTool && tableCandidates.length > 0) {
      for (const tableName of tableCandidates) {
        if (budget.remaining <= 0) break;
        try {
          const result = await tryGetTableSchema(server, schemaTool, tableName, budget);
          if (isEmptySchemaResult(result)) {
            throw new Error('Schema lookup returned empty content');
          }
          evidence.push({
            server: server.name,
            tool: schemaTool.name,
            summary: `${tableName}: ${summarizeResult(result)}`,
            raw: result,
          });
          serverEvidenceCount++;
        } catch (error: any) {
          const initialError = error?.message || 'unknown error';
          try {
            const actualTables = await ensureTableList();
            const matchedTable = findClosestTableMatch([tableName], actualTables);
            if (!matchedTable || budget.remaining <= 0) continue;
            const result = await tryGetTableSchema(server, schemaTool, matchedTable, budget);
            if (isEmptySchemaResult(result)) continue;
            evidence.push({
              server: server.name,
              tool: schemaTool.name,
              summary: `${tableName} -> ${matchedTable}: ${summarizeResult(result)}`,
              raw: result,
            });
            serverEvidenceCount++;
          } catch (fallbackError: any) {
            failures.push(`[${server.name}] ${schemaTool.name} failed for ${tableName}: ${initialError}; fallback failed: ${fallbackError?.message || 'unknown error'}`);
            continue;
          }
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
