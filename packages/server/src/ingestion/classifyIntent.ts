export type IntentMode = 'pure-text' | 'intent-card';

export type IntentSource =
  | null
  | { kind: 'url'; payload: string }
  | { kind: 'image'; mimeType: string; base64: string };

export type SuggestedMode = 'mirror' | 'ast' | 'pure-text' | undefined;

export interface ChatAttachment {
  kind: 'image';
  mimeType: string;
  base64: string;
}

export interface ClassifyInput {
  text: string;
  attachments: ChatAttachment[];
}

export interface ClassifyResult {
  mode: IntentMode;
  source: IntentSource;
  suggestedMode: SuggestedMode;
}

const URL_RE = /https?:\/\/[^\s<>"']+/;
const MIRROR_HINTS = [/照著抄/, /完整複製/, /仿這個/, /1\s*:\s*1/, /pixel[-\s]*perfect/i, /mirror/i];
const AST_HINTS = [/參考/, /像這個風格/, /套這個感/, /inspired\s*by/i];

function suggested(text: string, hasSource: boolean): SuggestedMode {
  if (!hasSource) return undefined;
  if (MIRROR_HINTS.some(r => r.test(text))) return 'mirror';
  if (AST_HINTS.some(r => r.test(text))) return 'ast';
  return undefined;
}

export function classifyIntent(input: ClassifyInput): ClassifyResult {
  const imgAttach = input.attachments.find(a => a.kind === 'image');
  if (imgAttach) {
    return {
      mode: 'intent-card',
      source: { kind: 'image', mimeType: imgAttach.mimeType, base64: imgAttach.base64 },
      suggestedMode: suggested(input.text, true),
    };
  }
  const m = input.text.match(URL_RE);
  if (m) {
    return {
      mode: 'intent-card',
      source: { kind: 'url', payload: m[0] },
      suggestedMode: suggested(input.text, true),
    };
  }
  return { mode: 'pure-text', source: null, suggestedMode: 'pure-text' };
}
