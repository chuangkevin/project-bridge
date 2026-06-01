const SLASH_RE = /^\/([\w:.-]+)(?:\s+([\s\S]*))?$/;

export interface SlashCommand { skill: string; rest: string; }

export function parseSlashCommand(input: string): SlashCommand | null {
  const trimmed = input.trim();
  const m = trimmed.match(SLASH_RE);
  if (!m) return null;
  return { skill: m[1]!, rest: (m[2] ?? '').trim() };
}
