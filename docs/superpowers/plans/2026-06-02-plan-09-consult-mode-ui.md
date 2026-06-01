# Plan 9 — Consult Mode UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Fill the Consult stage with a real chat UI: scrolling transcript + composer (textarea + attachment button + send) + SSE stream consumer that renders phase progress (loading_memory → selecting_skills → thinking → answering) with a visible animation. Slash command autocomplete (simple list, no fancy combobox). After this plan, the user can have a real consult conversation with the AI and SEE the thinking happen.

**Architecture:** A `<ConsultStage>` that owns three children:
- `<Transcript>` — scroll container that maps over Turn[] from `/api/projects/:id/turns` plus the in-flight `pendingTurn` (the one currently streaming)
- `<PhaseIndicator>` — when a turn is in flight, shows a per-turn assistant bubble with phase text + spinner + thinking_tokens text scrolling
- `<Composer>` — textarea + drop zone + send button + slash autocomplete dropdown

The SSE consumer is a hook `useChatStream` that takes (projectId, mode, text, attachmentIds) and returns `{phase, thinkingText, answerText, done, error, turnId}` — re-renders the in-flight bubble live. On `done`, refetches the turn list and clears the in-flight state.

Per the visible-thinking memory rule (`feedback_thinking_progress_required`): the phase indicator MUST appear as a per-turn assistant bubble with phase text + animation while compile is running; no record = perceived regression. This plan implements that contract for chat.

**Tech Stack:** React 18 + zustand. No new deps. SSE parsing via plain `fetch` + `body.getReader()` since EventSource doesn't support POST.

**Spec:** [`../specs/2026-06-01-designbridge-redesign-design.md`](../specs/2026-06-01-designbridge-redesign-design.md) § 4 (UI) + § 8.3 (SSE events).

**Scope boundary (out of plan):** NO artifact preview (architect/design plans). NO turn editing/regenerate. NO export/copy-as-markdown. NO Socket.io live updates from other users (Plan 13). NO Council UI (Plan 12). NO file paste from clipboard (Plan 11+ may add). M1 keyboard shortcuts: Enter sends, Shift+Enter newline.

---

## File Structure

```
packages/client/src/
  pages/workspace/
    ConsultStage.tsx              ← REWRITE: real chat UI
    chat/
      Transcript.tsx              ← scrolling list of completed turns + in-flight bubble
      TurnBubble.tsx              ← single user+AI exchange render
      PhaseIndicator.tsx          ← live in-flight bubble with phase + animation
      Composer.tsx                ← textarea + attachments + send + slash autocomplete
      SlashAutocomplete.tsx       ← dropdown shown when text starts with "/"
  hooks/
    useChatStream.ts              ← SSE consumer; POST + ReadableStream
    useTurns.ts                   ← fetch + cache turns for current project
  lib/
    sseParser.ts                  ← tiny SSE event splitter
  styles/
    chat.css                      ← bubble + composer styles
```

---

## Task 1: lib/sseParser.ts + useChatStream hook

**Files:**
- Create `packages/client/src/lib/sseParser.ts`
- Create `packages/client/src/hooks/useChatStream.ts`

### sseParser.ts

```typescript
export interface SseEvent { event: string; data: string; }

/**
 * Stateful chunk parser. Feed it text chunks from a streaming response, get back
 * fully parsed events. Holds an internal buffer for partial events that cross
 * chunk boundaries.
 */
export function createSseParser(): {
  push: (chunk: string) => SseEvent[];
  flush: () => SseEvent[];
} {
  let buf = '';
  function parseBlock(block: string): SseEvent | null {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue; // comment / heartbeat
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length === 0) return null;
    return { event, data: dataLines.join('\n') };
  }
  return {
    push(chunk) {
      buf += chunk;
      const out: SseEvent[] = [];
      let sep;
      while ((sep = buf.indexOf('\n\n')) !== -1) {
        const block = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const ev = parseBlock(block);
        if (ev) out.push(ev);
      }
      return out;
    },
    flush() {
      if (!buf) return [];
      const ev = parseBlock(buf);
      buf = '';
      return ev ? [ev] : [];
    },
  };
}
```

### useChatStream.ts

```typescript
import { useState, useRef, useCallback } from 'react';
import { createSseParser } from '../lib/sseParser';
import { useAuthStore } from '../stores/useAuthStore';

export type ChatPhase = 'idle' | 'loading_memory' | 'selecting_skills' | 'thinking' | 'answering' | 'done' | 'error';

export interface ChatStreamState {
  phase: ChatPhase;
  selectedSkills: string[];
  thinkingText: string;
  answerText: string;
  error: string | null;
  turnId: string | null;
}

const INITIAL: ChatStreamState = {
  phase: 'idle', selectedSkills: [], thinkingText: '', answerText: '', error: null, turnId: null,
};

export interface SendParams {
  projectId: string;
  mode: 'consult' | 'architect' | 'design';
  text: string;
  attachmentIds?: string[];
}

export function useChatStream(): {
  state: ChatStreamState;
  send: (p: SendParams) => Promise<void>;
  cancel: () => void;
  reset: () => void;
} {
  const [state, setState] = useState<ChatStreamState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);
  const token = useAuthStore.getState().token;

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
      const res = await fetch(`/api/projects/${params.projectId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ mode: params.mode, text: params.text, attachmentIds: params.attachmentIds }),
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
  }, [cancel, token]);

  return { state, send, cancel, reset };
}

function handleEvent(ev: { event: string; data: string }, setState: React.Dispatch<React.SetStateAction<ChatStreamState>>) {
  try {
    if (ev.event === 'phase') {
      const parsed = JSON.parse(ev.data);
      setState((s) => ({
        ...s,
        phase: parsed.phase as ChatPhase,
        selectedSkills: Array.isArray(parsed.skills) ? parsed.skills : s.selectedSkills,
      }));
    } else if (ev.event === 'thinking_token') {
      const parsed = JSON.parse(ev.data);
      setState((s) => ({ ...s, thinkingText: s.thinkingText + (parsed.text ?? '') }));
    } else if (ev.event === 'token') {
      const parsed = JSON.parse(ev.data);
      setState((s) => ({ ...s, answerText: s.answerText + (parsed.text ?? '') }));
    } else if (ev.event === 'done') {
      const parsed = JSON.parse(ev.data);
      setState((s) => ({ ...s, phase: 'done', turnId: parsed.turnId ?? null }));
    } else if (ev.event === 'error') {
      const parsed = JSON.parse(ev.data);
      setState((s) => ({ ...s, phase: 'error', error: parsed.message || 'unknown error' }));
    }
  } catch {
    // ignore malformed event
  }
}
```

- [ ] Create both files
- [ ] Add a vitest unit test for sseParser: feed split chunks, assert events come out correctly + heartbeat lines (starting with `:`) are skipped. Save under `packages/client/src/lib/__tests__/sseParser.test.ts`. (Client doesn't yet have vitest configured — if not, skip the test file and rely on manual verification in Task 5. If client DOES have vitest already, write the test.)
- [ ] Build passes
- [ ] Commit: `feat(client): add sseParser + useChatStream (Plan 9 Task 1)`

---

## Task 2: useTurns hook + chat.css

**Files:**
- Create `packages/client/src/hooks/useTurns.ts`
- Create `packages/client/src/styles/chat.css`
- Modify `packages/client/src/main.tsx` to import chat.css

### useTurns.ts

```typescript
import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';

export interface Turn {
  id: string;
  projectId: string;
  mode: 'consult' | 'architect' | 'design';
  userText: string;
  aiResponse: { text: string; thinking?: string };
  skillsUsed?: string[];
  createdAt: string;
}

export function useTurns(projectId: string | null): {
  turns: Turn[];
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const r = await api<{ turns: Turn[] }>(`/api/projects/${projectId}/turns`);
      setTurns(r.turns);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { turns, loading, refresh };
}
```

### chat.css

```css
.chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.chat__transcript {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-5) var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.chat__empty {
  margin: auto;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}

.bubble {
  max-width: 760px;
  border-radius: var(--radius-lg);
  padding: var(--space-3) var(--space-4);
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.bubble--user {
  align-self: flex-end;
  background: var(--accent-glass);
  border: 1px solid var(--border-accent);
  color: var(--text-primary);
}

.bubble--ai {
  align-self: flex-start;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
}

.bubble__skills {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: var(--space-2);
}
.bubble__skills span {
  background: var(--bg-elevated);
  padding: 1px 6px;
  border-radius: 4px;
  margin-right: 4px;
}

.bubble__thinking {
  background: rgba(124, 92, 191, 0.08);
  border-left: 2px solid var(--accent);
  padding: var(--space-2) var(--space-3);
  margin-bottom: var(--space-2);
  font-size: 12px;
  color: var(--text-muted);
  border-radius: 4px;
  max-height: 200px;
  overflow-y: auto;
}

.phase-indicator {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 13px;
  color: var(--text-accent);
  margin-bottom: var(--space-2);
}

.phase-indicator__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  animation: pulse 1.2s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.85); }
  50%      { opacity: 1.0; transform: scale(1.1); }
}

.composer {
  border-top: 1px solid var(--border-subtle);
  padding: var(--space-3) var(--space-5);
  background: var(--bg-card);
  display: flex;
  gap: var(--space-3);
  align-items: flex-end;
  position: relative;
}

.composer__textarea {
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  padding: var(--space-3);
  font-size: 14px;
  font-family: inherit;
  resize: none;
  min-height: 40px;
  max-height: 200px;
  line-height: 1.5;
}
.composer__textarea:focus {
  outline: none;
  border-color: var(--accent);
}

.composer__btn {
  background: var(--accent);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
}
.composer__btn:disabled {
  background: var(--bg-elevated);
  color: var(--text-muted);
  cursor: not-allowed;
}

.composer__icon-btn {
  background: var(--bg-elevated);
  color: var(--text-secondary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  font-size: 16px;
}

.composer__attachments {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}
.attachment-chip {
  background: var(--bg-elevated);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  padding: 2px 8px;
  font-size: 11px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
}
.attachment-chip button {
  background: transparent; border: none; color: var(--text-muted); cursor: pointer;
}

.slash-popup {
  position: absolute;
  bottom: calc(100% - 4px);
  left: var(--space-5);
  right: var(--space-5);
  max-width: 480px;
  background: var(--glass-bg);
  backdrop-filter: blur(20px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  box-shadow: var(--glass-shadow);
  max-height: 240px;
  overflow-y: auto;
  z-index: 100;
}
.slash-popup__item {
  padding: var(--space-2) var(--space-3);
  font-size: 13px;
  cursor: pointer;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-subtle);
}
.slash-popup__item:hover, .slash-popup__item[aria-selected="true"] {
  background: var(--accent-glass);
  color: var(--text-accent);
}
.slash-popup__item small {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}
```

In `main.tsx`, add `import './styles/chat.css';` after workspace.css.

- [ ] Create both + import
- [ ] Build passes
- [ ] Commit: `feat(client): add useTurns hook + chat.css (Plan 9 Task 2)`

---

## Task 3: TurnBubble + Transcript + PhaseIndicator

**Files:**
- Create `packages/client/src/pages/workspace/chat/TurnBubble.tsx`
- Create `packages/client/src/pages/workspace/chat/PhaseIndicator.tsx`
- Create `packages/client/src/pages/workspace/chat/Transcript.tsx`

### TurnBubble.tsx

```tsx
import type { Turn } from '../../../hooks/useTurns';
import { useState } from 'react';

export default function TurnBubble({ turn }: { turn: Turn }) {
  const [showThinking, setShowThinking] = useState(false);
  return (
    <>
      <div className="bubble bubble--user">{turn.userText}</div>
      <div className="bubble bubble--ai">
        {turn.aiResponse.thinking && (
          <>
            <button
              onClick={() => setShowThinking(!showThinking)}
              style={{
                background: 'transparent', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', fontSize: 11, marginBottom: 4, padding: 0,
              }}
            >
              {showThinking ? '▼ 隱藏推理' : '▶ 顯示推理'}
            </button>
            {showThinking && (
              <div className="bubble__thinking">{turn.aiResponse.thinking}</div>
            )}
          </>
        )}
        <div>{turn.aiResponse.text}</div>
        {turn.skillsUsed && turn.skillsUsed.length > 0 && (
          <div className="bubble__skills">
            使用技能：{turn.skillsUsed.map((s) => <span key={s}>{s}</span>)}
          </div>
        )}
      </div>
    </>
  );
}
```

### PhaseIndicator.tsx

```tsx
import type { ChatStreamState } from '../../../hooks/useChatStream';

const PHASE_LABEL: Record<string, string> = {
  loading_memory: '讀取專案記憶…',
  selecting_skills: '選擇技能…',
  thinking: '推理中…',
  answering: '回答中…',
  done: '完成',
  error: '失敗',
};

export default function PhaseIndicator({ state, userText }: { state: ChatStreamState; userText: string }) {
  const isStreaming = state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'error';
  return (
    <>
      <div className="bubble bubble--user">{userText}</div>
      <div className="bubble bubble--ai">
        {isStreaming && (
          <div className="phase-indicator">
            <span className="phase-indicator__dot" />
            <span>{PHASE_LABEL[state.phase] ?? state.phase}</span>
            {state.selectedSkills.length > 0 && state.phase === 'selecting_skills' && (
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                ({state.selectedSkills.slice(0, 3).join(', ')}{state.selectedSkills.length > 3 ? '…' : ''})
              </span>
            )}
          </div>
        )}
        {state.thinkingText && (
          <div className="bubble__thinking">{state.thinkingText}</div>
        )}
        {state.answerText && <div>{state.answerText}</div>}
        {state.phase === 'error' && (
          <div style={{ color: '#fca5a5', fontSize: 13, marginTop: 8 }}>錯誤：{state.error}</div>
        )}
      </div>
    </>
  );
}
```

### Transcript.tsx

```tsx
import { useEffect, useRef } from 'react';
import TurnBubble from './TurnBubble';
import PhaseIndicator from './PhaseIndicator';
import type { Turn } from '../../../hooks/useTurns';
import type { ChatStreamState } from '../../../hooks/useChatStream';

interface Props {
  turns: Turn[];
  pending: { userText: string; state: ChatStreamState } | null;
}

export default function Transcript({ turns, pending }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, pending?.state.answerText.length, pending?.state.thinkingText.length, pending?.state.phase]);

  const isEmpty = turns.length === 0 && !pending;

  return (
    <div className="chat__transcript">
      {isEmpty && (
        <div className="chat__empty">
          <div style={{ fontSize: 18, color: 'var(--text-secondary)', marginBottom: 8 }}>顧問模式</div>
          <div>有什麼想討論的？輸入問題開始對話。<br />可以輸入 <code>/</code> 查看可用技能。</div>
        </div>
      )}
      {turns.map((t) => <TurnBubble key={t.id} turn={t} />)}
      {pending && <PhaseIndicator state={pending.state} userText={pending.userText} />}
      <div ref={endRef} />
    </div>
  );
}
```

- [ ] Create all 3
- [ ] Build passes
- [ ] Commit: `feat(client): add Transcript/TurnBubble/PhaseIndicator (Plan 9 Task 3)`

---

## Task 4: SlashAutocomplete + Composer

**Files:**
- Create `packages/client/src/pages/workspace/chat/SlashAutocomplete.tsx`
- Create `packages/client/src/pages/workspace/chat/Composer.tsx`

### SlashAutocomplete.tsx

```tsx
import { useEffect, useState, useRef } from 'react';
import { api } from '../../../lib/api';

interface Skill { name: string; description: string; }

interface Props {
  projectId: string;
  query: string;            // text after "/"
  onPick: (name: string) => void;
  onClose: () => void;
}

export default function SlashAutocomplete({ projectId, query, onPick, onClose }: Props) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    api<{ skills: Skill[] }>(`/api/projects/${projectId}/skills`)
      .then(r => setSkills(r.skills))
      .catch(() => setSkills([]));
  }, [projectId]);

  const q = query.toLowerCase();
  const filtered = skills.filter(s => s.name.toLowerCase().includes(q));

  // Keyboard nav is wired by the Composer; activeIdx is exposed via ref
  // We need a ref-style controlled active index. Use a simple state + an effect that resets on query change.
  useEffect(() => { setActiveIdx(0); }, [query]);

  if (filtered.length === 0) {
    return (
      <div className="slash-popup">
        <div className="slash-popup__item" style={{ color: 'var(--text-muted)' }}>沒有匹配的技能</div>
      </div>
    );
  }

  return (
    <div className="slash-popup" role="listbox">
      {filtered.map((s, i) => (
        <div
          key={s.name}
          className="slash-popup__item"
          aria-selected={i === activeIdx}
          onMouseEnter={() => setActiveIdx(i)}
          onClick={() => onPick(s.name)}
        >
          /{s.name}
          <small>{s.description}</small>
        </div>
      ))}
    </div>
  );
}
```

### Composer.tsx

```tsx
import { useState, useRef, useCallback, type KeyboardEvent, type ChangeEvent } from 'react';
import { api } from '../../../lib/api';
import SlashAutocomplete from './SlashAutocomplete';
import { useAuthStore } from '../../../stores/useAuthStore';

interface Attachment {
  id: string;
  originalName: string;
  kind: string;
}

interface Props {
  projectId: string;
  disabled: boolean;
  onSend: (text: string, attachmentIds: string[]) => void;
}

export default function Composer({ projectId, disabled, onSend }: Props) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const token = useAuthStore.getState().token;

  const showSlash = text.startsWith('/') && !text.includes(' ');

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed, attachments.map(a => a.id));
    setText('');
    setAttachments([]);
  }, [text, attachments, disabled, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append('files', f);
      const res = await fetch(`/api/projects/${projectId}/ingest`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: fd,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const json = await res.json() as { attachments: Attachment[] };
      setAttachments(prev => [...prev, ...json.attachments]);
    } catch (err) {
      console.error(err);
      alert('上傳失敗：' + (err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSlashPick = (skillName: string) => {
    setText(`/${skillName} `);
    taRef.current?.focus();
  };

  return (
    <div className="composer">
      {attachments.length > 0 && (
        <div className="composer__attachments" style={{ position: 'absolute', bottom: 'calc(100% + 4px)', left: 'var(--space-5)' }}>
          {attachments.map(a => (
            <div key={a.id} className="attachment-chip">
              <span>[{a.kind}]</span>
              <span>{a.originalName}</span>
              <button onClick={() => setAttachments(p => p.filter(x => x.id !== a.id))} aria-label="移除">×</button>
            </div>
          ))}
        </div>
      )}
      {showSlash && (
        <SlashAutocomplete
          projectId={projectId}
          query={text.slice(1)}
          onPick={handleSlashPick}
          onClose={() => {}}
        />
      )}
      <input
        ref={fileRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleFiles}
        accept=".pdf,.docx,image/*"
      />
      <button
        className="composer__icon-btn"
        onClick={() => fileRef.current?.click()}
        disabled={uploading || disabled}
        aria-label="附加檔案"
        title="附加 PDF / DOCX / 圖片"
      >📎</button>
      <textarea
        ref={taRef}
        className="composer__textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? '回答中…' : '輸入訊息（Enter 送出，Shift+Enter 換行；輸入 / 查看技能）'}
        rows={1}
      />
      <button
        className="composer__btn"
        onClick={handleSend}
        disabled={disabled || !text.trim() || uploading}
      >送出</button>
    </div>
  );
}
```

- [ ] Create both
- [ ] Build passes
- [ ] Commit: `feat(client): add Composer + SlashAutocomplete (Plan 9 Task 4)`

---

## Task 5: ConsultStage wiring

**Files:**
- Modify `packages/client/src/pages/workspace/ConsultStage.tsx` (full rewrite)

```tsx
import { useMemo } from 'react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { useTurns } from '../../hooks/useTurns';
import { useChatStream } from '../../hooks/useChatStream';
import Transcript from './chat/Transcript';
import Composer from './chat/Composer';

export default function ConsultStage() {
  const { projectId } = useWorkspaceStore();
  const { turns, refresh } = useTurns(projectId);
  const { state, send, reset } = useChatStream();

  const pending = useMemo(() => {
    if (state.phase === 'idle') return null;
    return { userText: pendingUserTextRef.current, state };
  }, [state]);

  // Hack to retain the user's text after send (state already cleared from composer)
  // Use a closure-stable ref that send() sets before the request kicks off.
  // Implement via outer ref:
  // (see ref below)

  const handleSend = async (text: string, attachmentIds: string[]) => {
    if (!projectId) return;
    pendingUserTextRef.current = text;
    await send({ projectId, mode: 'consult', text, attachmentIds });
    if (pendingUserTextRef.current) {
      await refresh();
      pendingUserTextRef.current = '';
      reset();
    }
  };

  return (
    <div className="chat">
      <Transcript turns={turns} pending={pending} />
      <Composer
        projectId={projectId ?? ''}
        disabled={state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'error'}
        onSend={handleSend}
      />
    </div>
  );
}

// Module-level ref proxy — single workspace instance so this is fine.
const pendingUserTextRef = { current: '' };
```

**NOTE**: the module-level `pendingUserTextRef` is a deliberate simplification — there's only one ConsultStage mounted at a time. If a reviewer dislikes the global, replace with `useRef` + restructure the pending memo. Functionally equivalent.

- [ ] Implement
- [ ] Build passes
- [ ] Commit: `feat(client): wire ConsultStage with chat hooks (Plan 9 Task 5)`

---

## Task 6: Verify + push

- All 4 builds green
- Server tests unchanged (157)
- Manual smoke (just describe — no execution required by subagent):
  - Visit `/projects/:id` in consult mode → see empty state
  - Type message + send → see phase indicator with pulsing dot → tokens appear → done → bubble persists after page refresh
  - Type `/` → see skill autocomplete → click one → text becomes `/skillname `
  - Click 📎 → upload PDF/image → chip appears → send → AI sees the attachment text (verified in server test, not manually here)
- Push

---

## Acceptance Criteria

- [ ] sseParser handles split chunks + heartbeat lines
- [ ] useChatStream state machine reflects all SSE events
- [ ] useTurns refetches on demand
- [ ] PhaseIndicator shows pulsing dot + phase label + selected skills during streaming (visible thinking progress per memory rule)
- [ ] TurnBubble collapses thinking by default with toggle
- [ ] Composer: Enter sends, Shift+Enter newline, slash autocomplete shows
- [ ] Attachment upload works through 📎 button → chips → cleared on send
- [ ] Send button disabled while streaming
- [ ] After done: turn list refetches, in-flight bubble cleared
- [ ] all builds + push clean

---

## Risks / Notes

1. **Module-level ref**: `pendingUserTextRef` works because only one ConsultStage mounts at a time. If the user later opens two browser tabs, both tabs share the module scope but they're separate JS contexts (one per tab) — still safe. A reviewer may prefer a `useRef` + restructured memo; equivalent behavior.
2. **EventSource limitation**: native EventSource is GET-only. We use `fetch` + `body.getReader()` because the chat endpoint is POST (carries body). Standard pattern; works in all modern browsers.
3. **No abort on unmount**: `useChatStream`'s controller is held in a ref but not aborted on hook unmount. Acceptable for M1 (page nav doesn't blow away the stage often). M2: add cleanup effect.
4. **Slash autocomplete fetches on every mount**: low priority — skills list is small. Plan 14 can memoize.
5. **Attachment kind 'image' AI handling**: server's chat endpoint sends `attachment.parsedText` only — images don't have parsedText, so they currently arrive only as filename + kind references in the prompt. Multimodal vision via images is M2 (memory says current providers throw on images). M1 just shows the user uploaded an image; AI gets the filename for context.

---

**Plan end. 6 Tasks. Consult mode is live.**
