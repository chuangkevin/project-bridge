import { useCallback } from 'react';
import { create } from 'zustand';
import { createSseParser } from '../lib/sseParser';
import { getToken } from '../lib/api';

export type ChatPhase = 'idle' | 'loading_memory' | 'selecting_skills' | 'thinking' | 'answering' | 'done' | 'error'
  | 'council_start' | 'council_pm' | 'council_designer' | 'council_engineer' | 'council_moderator';

export interface CouncilEntry { persona: 'pm' | 'designer' | 'engineer' | 'moderator'; text: string; }

export interface ProviderMeta {
  provider: string;
  model: string;
  requestedModel: string;
  fallback: boolean;
}

export interface ChatStreamState {
  phase: ChatPhase;
  selectedSkills: string[];
  thinkingText: string;
  answerText: string;
  error: string | null;
  turnId: string | null;
  council: CouncilEntry[];
  activeCouncilPersona: CouncilEntry['persona'] | null;
  providerMeta: ProviderMeta | null;
  /** Server-provided human-readable phase detail（例：合議完成，正在生成設計…） */
  phaseMessage: string | null;
  /** The user message that started this stream（pending bubble 顯示用） */
  userText: string;
  /** Quick-reply options offered by the AI（點了直接送出，不用手打） */
  choices: string[];
  /** Server asked the client to switch workspace mode（顧問→設計自動接力） */
  handoffTo: 'design' | null;
}

const INITIAL: ChatStreamState = {
  phase: 'idle', selectedSkills: [], thinkingText: '', answerText: '', error: null, turnId: null,
  council: [], activeCouncilPersona: null, providerMeta: null, phaseMessage: null, userText: '',
  choices: [], handoffTo: null,
};

export interface SendParams {
  projectId: string;
  mode: 'consult' | 'architect' | 'design';
  text: string;
  attachmentIds?: string[];
  council?: boolean;
  replicationIntent?: {
    intent: 'replicate' | 'style-only' | 'reference';
    destination?: 'new' | 'element';
    elementPath?: number[];
  };
}

export interface SendResult {
  ok: boolean;
  phase: ChatPhase;
  error: string | null;
}

export function streamKey(projectId: string, _mode?: SendParams['mode']): string {
  // ONE conversation per project — the key ignores mode on purpose so
  // switching 顧問/架構/設計 tabs never "loses" the live stream.
  return projectId;
}

// ─── Global stream store ────────────────────────────────────────────────────
//
// The SSE read loop and its state live HERE, not in any component. Switching
// mode tabs（顧問↔設計）or otherwise unmounting a stage must NOT look like an
// interruption — the server keeps streaming, so the UI keeps accumulating;
// remounted stages pick the live state right back up.

interface StreamStore {
  streams: Record<string, ChatStreamState>;
  send: (params: SendParams) => Promise<SendResult>;
  cancel: (key: string) => void;
  reset: (key: string) => void;
}

const controllers = new Map<string, AbortController>();

const useChatStreamStore = create<StreamStore>((set, get) => {
  const patch = (key: string, updater: (s: ChatStreamState) => ChatStreamState): void => {
    set((store) => ({ streams: { ...store.streams, [key]: updater(store.streams[key] ?? INITIAL) } }));
  };

  return {
    streams: {},

    cancel: (key) => {
      controllers.get(key)?.abort();
      controllers.delete(key);
    },

    reset: (key) => {
      set((store) => {
        const next = { ...store.streams };
        delete next[key];
        return { streams: next };
      });
    },

    send: async (params) => {
      const key = streamKey(params.projectId, params.mode);
      get().cancel(key);
      const ctrl = new AbortController();
      controllers.set(key, ctrl);
      patch(key, () => ({ ...INITIAL, phase: 'loading_memory', userText: params.text }));

      try {
        const token = getToken();
        const res = await fetch(`/api/projects/${params.projectId}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ mode: params.mode, text: params.text, attachmentIds: params.attachmentIds, council: params.council, replicationIntent: params.replicationIntent }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const msg = await res.text().catch(() => '');
          const errMsg = msg || `HTTP ${res.status}`;
          patch(key, (s) => ({ ...s, phase: 'error', error: errMsg }));
          return { ok: false, phase: 'error', error: errMsg };
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const parser = createSseParser();

        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            for (const ev of parser.flush()) handleEvent(ev, (fn) => patch(key, fn));
            break;
          }
          const text = decoder.decode(value, { stream: true });
          for (const ev of parser.push(text)) handleEvent(ev, (fn) => patch(key, fn));
        }

        const final = get().streams[key] ?? INITIAL;
        return { ok: final.phase === 'done', phase: final.phase, error: final.error };
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          return { ok: false, phase: (get().streams[key] ?? INITIAL).phase, error: 'aborted' };
        }
        const errMsg = (e as Error).message;
        patch(key, (s) => ({ ...s, phase: 'error', error: errMsg }));
        return { ok: false, phase: 'error', error: errMsg };
      } finally {
        if (controllers.get(key) === ctrl) controllers.delete(key);
      }
    },
  };
});

/**
 * Stage-facing hook. State is selected from the global store by
 * (projectId, mode) — a stage that unmounts and remounts mid-stream sees the
 * stream exactly where it is, not an interruption.
 */
export function useChatStream(projectId: string | null, mode: SendParams['mode']): {
  state: ChatStreamState;
  send: (p: SendParams) => Promise<SendResult>;
  cancel: () => void;
  reset: () => void;
} {
  const key = projectId ? streamKey(projectId, mode) : '';
  const state = useChatStreamStore((s) => (key ? s.streams[key] : undefined) ?? INITIAL);
  const send = useChatStreamStore((s) => s.send);
  const cancelByKey = useChatStreamStore((s) => s.cancel);
  const resetByKey = useChatStreamStore((s) => s.reset);

  const cancel = useCallback(() => { if (key) cancelByKey(key); }, [key, cancelByKey]);
  const reset = useCallback(() => { if (key) resetByKey(key); }, [key, resetByKey]);

  return { state, send, cancel, reset };
}

function handleEvent(
  ev: { event: string; data: string },
  setState: (fn: (s: ChatStreamState) => ChatStreamState) => void,
) {
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
          phaseMessage: typeof parsed.message === 'string' ? parsed.message : null,
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
    } else if (ev.event === 'choices') {
      const parsed = JSON.parse(ev.data);
      setState((s) => ({ ...s, choices: Array.isArray(parsed.choices) ? parsed.choices.filter((c: unknown) => typeof c === 'string') : [] }));
    } else if (ev.event === 'mode_handoff') {
      const parsed = JSON.parse(ev.data);
      if (parsed.to === 'design') setState((s) => ({ ...s, handoffTo: 'design' }));
    } else if (ev.event === 'meta') {
      const parsed = JSON.parse(ev.data);
      setState((s) => ({
        ...s,
        providerMeta: {
          provider: parsed.provider ?? '',
          model: parsed.model ?? '',
          requestedModel: parsed.requestedModel ?? '',
          fallback: parsed.fallback === true,
        },
      }));
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
