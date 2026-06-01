import { useState, useRef, useCallback, type Dispatch, type SetStateAction } from 'react';
import { createSseParser } from '../lib/sseParser';
import { getToken } from '../lib/api';

export type ChatPhase = 'idle' | 'loading_memory' | 'selecting_skills' | 'thinking' | 'answering' | 'done' | 'error'
  | 'council_start' | 'council_pm' | 'council_designer' | 'council_engineer' | 'council_moderator';

export interface CouncilEntry { persona: 'pm' | 'designer' | 'engineer' | 'moderator'; text: string; }

export interface ChatStreamState {
  phase: ChatPhase;
  selectedSkills: string[];
  thinkingText: string;
  answerText: string;
  error: string | null;
  turnId: string | null;
  council: CouncilEntry[];
  activeCouncilPersona: CouncilEntry['persona'] | null;
}

const INITIAL: ChatStreamState = {
  phase: 'idle', selectedSkills: [], thinkingText: '', answerText: '', error: null, turnId: null,
  council: [], activeCouncilPersona: null,
};

export interface SendParams {
  projectId: string;
  mode: 'consult' | 'architect' | 'design';
  text: string;
  attachmentIds?: string[];
  council?: boolean;
}

export function useChatStream(): {
  state: ChatStreamState;
  send: (p: SendParams) => Promise<void>;
  cancel: () => void;
  reset: () => void;
} {
  const [state, setState] = useState<ChatStreamState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const reset = useCallback(() => setState(INITIAL), []);

  const send = useCallback(async (params: SendParams) => {
    cancel();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ ...INITIAL, phase: 'loading_memory' });

    try {
      const token = getToken();
      const res = await fetch(`/api/projects/${params.projectId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ mode: params.mode, text: params.text, attachmentIds: params.attachmentIds, council: params.council }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const msg = await res.text().catch(() => '');
        setState((s) => ({ ...s, phase: 'error', error: msg || `HTTP ${res.status}` }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const parser = createSseParser();

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          for (const ev of parser.flush()) handleEvent(ev, setState);
          break;
        }
        const text = decoder.decode(value, { stream: true });
        for (const ev of parser.push(text)) handleEvent(ev, setState);
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setState((s) => ({ ...s, phase: 'error', error: (e as Error).message }));
    } finally {
      abortRef.current = null;
    }
  }, [cancel]);

  return { state, send, cancel, reset };
}

function handleEvent(ev: { event: string; data: string }, setState: Dispatch<SetStateAction<ChatStreamState>>) {
  try {
    if (ev.event === 'phase') {
      const parsed = JSON.parse(ev.data);
      if (parsed.phase === 'council_start') {
        setState((s) => ({ ...s, phase: 'council_start', council: [], activeCouncilPersona: null }));
      } else if (parsed.phase?.startsWith('council_') && !parsed.phase.endsWith('_done')) {
        setState((s) => ({
          ...s,
          phase: parsed.phase as ChatPhase,
          activeCouncilPersona: parsed.persona ?? s.activeCouncilPersona,
        }));
      } else if (parsed.phase?.endsWith('_done')) {
        setState((s) => ({
          ...s,
          activeCouncilPersona: s.activeCouncilPersona === parsed.persona ? null : s.activeCouncilPersona,
        }));
      } else {
        setState((s) => ({
          ...s,
          phase: parsed.phase as ChatPhase,
          selectedSkills: Array.isArray(parsed.skills) ? parsed.skills : s.selectedSkills,
        }));
      }
    } else if (ev.event === 'council_token') {
      const parsed = JSON.parse(ev.data);
      const persona = parsed.persona as CouncilEntry['persona'];
      setState((s) => {
        const idx = s.council.findIndex(c => c.persona === persona);
        if (idx === -1) {
          return { ...s, council: [...s.council, { persona, text: parsed.text ?? '' }] };
        }
        const next = [...s.council];
        next[idx] = { ...next[idx], text: next[idx].text + (parsed.text ?? '') };
        return { ...s, council: next };
      });
    } else if (ev.event === 'thinking_token') {
      const parsed = JSON.parse(ev.data);
      setState((s) => ({ ...s, thinkingText: s.thinkingText + (parsed.text ?? '') }));
    } else if (ev.event === 'token') {
      const parsed = JSON.parse(ev.data);
      setState((s) => ({ ...s, answerText: s.answerText + (parsed.text ?? '') }));
    } else if (ev.event === 'done') {
      const parsed = JSON.parse(ev.data);
      setState((s) => ({ ...s, phase: 'done', turnId: parsed.turnId ?? null, activeCouncilPersona: null }));
    } else if (ev.event === 'error') {
      const parsed = JSON.parse(ev.data);
      setState((s) => ({ ...s, phase: 'error', error: parsed.message || 'unknown error' }));
    }
  } catch {
    // ignore malformed event
  }
}
