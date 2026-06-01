# Plan 12 — Council (合議制) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Opt-in mode where the AI deliberates as 4 personas before answering: PM (product manager) → Designer → Engineer → Moderator (synthesizes). User sees each persona's contribution as separate streaming bubbles, then a final unified answer. After this plan, complex decisions visibly go through structured debate before a single response.

**Architecture:** Server side — a `councilOrchestrator` runs the personas sequentially over the SAME memory snapshot. Each persona is a separate provider call with its own system prompt addition (loaded from built-in skills). The chat route gains a `council: true` request flag. When enabled, instead of one streaming call, it runs four (PM → Designer → Engineer → Moderator). Each persona's tokens stream as `event: council_token { persona, text }` and phase transitions stream as `event: phase { phase: 'council_pm' | 'council_designer' | …, persona }`. The Moderator's output is the final "answer" stored in the Turn; other personas are stored in `Turn.aiResponse.thinking` as a labeled block. Client side — `useChatStream` parses council events into a `councilTurns: { persona, text }[]` slice of state; `PhaseIndicator` and `TurnBubble` render personas as accordion bubbles with persona avatars.

**Tech Stack:** No new deps. Reuses callProvider, chatOrchestrator, sseParser. Adds 4 built-in skills under `skills/builtin/`.

**Spec:** [`../specs/2026-06-01-designbridge-redesign-design.md`](../specs/2026-06-01-designbridge-redesign-design.md) § 6 (Council).

**Scope boundary (out of plan):** NO parallel persona calls (sequential to keep ordering deterministic + rate-limit-friendly). NO inter-persona refutations beyond the moderator step. NO custom persona configuration UI (built-ins only — M2 can let users add). NO council in artifact-producing modes (architect/design) — Council is consult-only in M1 because it muddies artifact extraction. NO per-persona attachment routing.

---

## File Structure

```
packages/server/src/
  skills/builtin/
    council-pm.md
    council-designer.md
    council-engineer.md
    council-moderator.md
  services/
    councilOrchestrator.ts        ← runs PM → Designer → Engineer → Moderator
    __tests__/councilOrchestrator.test.ts
  routes/chat.ts                  ← MODIFY: accept `council` flag, fork to council path
  routes/__tests__/chat.route.test.ts  ← ADD: council mode tests

packages/client/src/
  hooks/useChatStream.ts          ← MODIFY: handle council_token + new phases
  pages/workspace/chat/
    PhaseIndicator.tsx            ← MODIFY: render per-persona accordion + active highlight
    TurnBubble.tsx                ← MODIFY: render council debate above final answer
  styles/chat.css                 ← MODIFY: persona styling
  pages/workspace/ConsultStage.tsx ← MODIFY: add "合議" toggle + pass council flag
```

---

## Task 1: Built-in council skills

**Files:**
- Create 4 `.md` files under `packages/server/src/skills/builtin/`

### council-pm.md

```markdown
---
name: council-pm
description: PM 視角；負責釐清需求、定義成功指標、優先排序
---

你目前是「產品經理（PM）」視角。你的任務：

1. 先用 1-2 句話總結你理解的使用者需求。
2. 列出 3 個你想再確認的點（用「？」結尾的問題）。
3. 提出 2-3 個你認為的成功指標（measurable）。
4. 給優先級建議：哪些先做，哪些可以延後。

風格：直接、具體、不講廢話。最多 200 字。不要做最終答覆——後面還有設計師與工程師會接續，最後由主持人彙整。
```

### council-designer.md

```markdown
---
name: council-designer
description: Designer 視角；負責使用者體驗、資訊架構、視覺
---

你目前是「設計師（Designer）」視角。前面 PM 已經分析過。你的任務：

1. 從使用者體驗角度回應 PM 的釐清點。
2. 提出 1-2 個關鍵的 UX 決策（畫面流程、互動模式、資訊架構）。
3. 點出可能踩雷的設計坑（accessibility、混亂的導引、過載的畫面…）。

風格：以使用者為中心，舉具體畫面例子。最多 200 字。不要做最終答覆。
```

### council-engineer.md

```markdown
---
name: council-engineer
description: Engineer 視角；負責可行性、技術風險、成本估算
---

你目前是「工程師（Engineer）」視角。前面 PM 與設計師已經討論過。你的任務：

1. 評估技術可行性：有沒有明顯的卡點？
2. 估算大致成本：時數、依賴、需要的服務。
3. 提出 1-2 個能降低風險的替代方案或階段切分。

風格：務實、具體、避免術語轟炸。最多 200 字。不要做最終答覆。
```

### council-moderator.md

```markdown
---
name: council-moderator
description: Moderator 視角；彙整三方意見並輸出最終答覆
---

你目前是「主持人（Moderator）」視角。你已看過 PM、設計師、工程師的討論。你的任務是給使用者最終答覆：

1. 用一句話總結三方共識（如果有）或主要分歧（如果沒有）。
2. 給出可執行的下一步——具體到「使用者可以做什麼」。
3. 如有需要，列出仍待釐清的問題清單。

風格：清楚、可行動、像是給使用者一份會議結論。沒有字數上限，但盡量精煉。
```

- [ ] Create all 4 skill files (server will pick them up via `services/skillRegistry.ts` built-in scan)
- [ ] Verify with a manual call: `listSkills({ projectId: 'x' })` should return them
- [ ] Commit: `feat(server): add 4 council persona built-in skills (Plan 12 Task 1)`

---

## Task 2: councilOrchestrator service

**Files:**
- Create `packages/server/src/services/councilOrchestrator.ts`
- Create `packages/server/src/services/__tests__/councilOrchestrator.test.ts`

### API

```typescript
import type Database from 'better-sqlite3';
import { callProvider } from './callProvider.js';
import { readSkill } from './skillRegistry.js';

export type CouncilPersona = 'pm' | 'designer' | 'engineer' | 'moderator';

export interface CouncilStepEvent {
  kind: 'persona_start' | 'persona_token' | 'persona_end';
  persona: CouncilPersona;
  text?: string;
}

export interface RunCouncilOpts {
  baseSystemPrompt: string;        // already-assembled (mode + memory + skills) prompt
  userText: string;
  mode: 'consult' | 'architect' | 'design';
  projectId: string;
}

const PERSONAS: { persona: CouncilPersona; skillName: string }[] = [
  { persona: 'pm', skillName: 'council-pm' },
  { persona: 'designer', skillName: 'council-designer' },
  { persona: 'engineer', skillName: 'council-engineer' },
  { persona: 'moderator', skillName: 'council-moderator' },
];

/**
 * Runs the four personas sequentially, yielding step events.
 * Each non-moderator persona's output is appended to the running transcript that the
 * next persona sees. Moderator gets the full transcript + the request to synthesize.
 *
 * Returns: { transcripts: Record<CouncilPersona, string>, finalAnswer: string }
 * via the generator's return value.
 */
export async function* runCouncil(opts: RunCouncilOpts): AsyncGenerator<CouncilStepEvent, { transcripts: Record<CouncilPersona, string>; finalAnswer: string }, void> {
  const transcripts: Record<CouncilPersona, string> = { pm: '', designer: '', engineer: '', moderator: '' };

  for (const p of PERSONAS) {
    const personaSkill = readSkill(p.skillName, { projectId: opts.projectId });
    if (!personaSkill) throw new Error(`council persona skill missing: ${p.skillName}`);

    // Compose system prompt: base + persona overlay + prior transcripts
    let priorContext = '';
    for (const earlier of PERSONAS) {
      if (earlier.persona === p.persona) break;
      if (transcripts[earlier.persona]) {
        priorContext += `\n\n## 前面 ${earlier.persona.toUpperCase()} 已經說：\n${transcripts[earlier.persona]}`;
      }
    }
    const personaPrompt = `${opts.baseSystemPrompt}\n\n## 你的身份\n${personaSkill.body}${priorContext}`;

    yield { kind: 'persona_start', persona: p.persona };

    let buffer = '';
    for await (const tok of callProvider({
      mode: opts.mode,
      prompt: opts.userText,
      systemInstruction: personaPrompt,
      streaming: true,
    })) {
      buffer += tok;
      yield { kind: 'persona_token', persona: p.persona, text: tok };
    }
    transcripts[p.persona] = buffer;
    yield { kind: 'persona_end', persona: p.persona };
  }

  return { transcripts, finalAnswer: transcripts.moderator };
}
```

### Tests

- Mock `callProvider` to yield deterministic tokens per persona.
- Test: 4 personas execute in order pm → designer → engineer → moderator
- Test: each persona's system prompt receives the prior personas' transcripts
- Test: `finalAnswer === transcripts.moderator`
- Test: thrown error if a persona skill is missing (use a project without built-ins available)

To assert the system prompt content, capture each call:

```typescript
import { vi } from 'vitest';
import * as cpModule from '../callProvider';

const captured: Array<{ systemInstruction: string }> = [];
vi.spyOn(cpModule, 'callProvider').mockImplementation((params: { systemInstruction?: string }) => {
  captured.push({ systemInstruction: params.systemInstruction ?? '' });
  return (async function*() { yield 'mock'; })();
});
```

Test that the moderator's `systemInstruction` contains all three earlier `## 前面 PM 已經說` / `## 前面 DESIGNER 已經說` / `## 前面 ENGINEER 已經說` sections.

- [ ] Implement + tests pass
- [ ] Commit: `feat(server): add councilOrchestrator with 4 sequential personas (Plan 12 Task 2)`

---

## Task 3: Chat route council integration

**Files:**
- Modify `packages/server/src/routes/chat.ts`
- Modify `packages/server/src/routes/__tests__/chat.route.test.ts`

### chat.ts changes

Accept `council: boolean` in request body. If `mode !== 'consult'`, force council to false (out-of-scope per Plan 12 boundary).

When council is enabled, branch the streaming logic:

```typescript
import { runCouncil } from '../services/councilOrchestrator.js';

// inside the route handler, after building userSystem:
const useCouncil = mode === 'consult' && req.body?.council === true;

if (useCouncil) {
  sse(res, 'phase', { phase: 'council_start' });
  const cleanText = slashCmd ? slashCmd.rest : text.trim();
  const gen = runCouncil({ baseSystemPrompt: userSystem, userText: cleanText, mode, projectId });
  let stepResult: IteratorResult<unknown, { transcripts: Record<string, string>; finalAnswer: string }>;
  while (true) {
    stepResult = await gen.next();
    if (stepResult.done) break;
    const ev = stepResult.value as { kind: string; persona: string; text?: string };
    if (ev.kind === 'persona_start') sse(res, 'phase', { phase: `council_${ev.persona}`, persona: ev.persona });
    else if (ev.kind === 'persona_token') sse(res, 'council_token', { persona: ev.persona, text: ev.text });
    else if (ev.kind === 'persona_end') sse(res, 'phase', { phase: `council_${ev.persona}_done`, persona: ev.persona });
  }

  const { transcripts, finalAnswer } = stepResult.value;
  const answerText = finalAnswer;
  // Build a thinking block that records the debate
  const thinkingText = ['pm','designer','engineer'].map(p => `### ${p.toUpperCase()}\n${transcripts[p]}`).join('\n\n');

  // Persist turn (no facts/artifacts parsing in council M1)
  const turn = appendTurn(db, {
    projectId, mode: mode as TurnMode,
    userText: text.trim(),
    aiResponse: { text: answerText, thinking: thinkingText },
    skillsUsed: ['council-pm', 'council-designer', 'council-engineer', 'council-moderator'],
  });

  sse(res, 'done', { turnId: turn.id });
  // Skip the non-council path below
  return finally_cleanup_section;  // <- ensure flow falls through to keepalive stop + res.end()
}

// existing non-council streaming path stays as-is
```

**IMPORTANT**: don't duplicate the cleanup; structure the conditional so both paths fall through to `stopSseKeepalive` + `res.end()` in the `finally` block. Use a try/catch that wraps both branches.

### Test additions

```typescript
it('council mode runs four personas and emits council_token events', async () => {
  // Provider mock that returns different content per persona based on systemInstruction marker
  const callCount = { n: 0 };
  vi.spyOn(providerModule, 'getProvider').mockReturnValue({
    streamContent: async function*(params: { systemInstruction?: string }) {
      callCount.n += 1;
      const which = params.systemInstruction?.match(/council-(pm|designer|engineer|moderator)/);
      yield `[${which?.[1] ?? 'unknown'}] reply`;
    },
    generateContent: vi.fn(),
  } as never);

  const r = await request(app).post(`/api/projects/${projectId}/chat`).set(auth())
    .send({ mode: 'consult', text: 'design a counter', council: true });

  expect(callCount.n).toBe(4);
  expect(r.text).toContain('council_pm');
  expect(r.text).toContain('council_designer');
  expect(r.text).toContain('council_engineer');
  expect(r.text).toContain('council_moderator');
  expect(r.text).toContain('event: council_token');
});

it('council=true on non-consult mode is ignored', async () => {
  mockProvider(['only-one-call']);
  // architect mode + council=true → falls back to normal single-call path
  const r = await request(app).post(`/api/projects/${projectId}/chat`).set(auth())
    .send({ mode: 'architect', text: 'hi', council: true });
  expect(r.text).not.toContain('council_token');
});
```

- [ ] Implement + tests pass (target ~177)
- [ ] Commit: `feat(server): wire council mode into /chat SSE route (Plan 12 Task 3)`

---

## Task 4: Client — useChatStream council events + UI

**Files:**
- Modify `packages/client/src/hooks/useChatStream.ts`
- Modify `packages/client/src/pages/workspace/chat/PhaseIndicator.tsx`
- Modify `packages/client/src/pages/workspace/chat/TurnBubble.tsx`
- Modify `packages/client/src/pages/workspace/ConsultStage.tsx`
- Modify `packages/client/src/styles/chat.css`

### useChatStream changes

Extend state:

```typescript
export interface CouncilEntry { persona: 'pm'|'designer'|'engineer'|'moderator'; text: string; }

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
```

`INITIAL` adds `council: [], activeCouncilPersona: null`.

In `handleEvent`:
- on `event: phase` with `phase` starting with `council_`: set `activeCouncilPersona` from `parsed.persona`
- on `event: council_token`: append `text` to the existing entry for `parsed.persona`, or create a new entry if missing
- on `event: phase` with `council_X_done`: leave entry; clear `activeCouncilPersona` if persona was that one
- on `event: done`: clear `activeCouncilPersona`

```typescript
} else if (ev.event === 'phase' && parsed.phase?.startsWith('council_') && !parsed.phase.endsWith('_done') && parsed.phase !== 'council_start') {
  setState((s) => ({
    ...s,
    phase: parsed.phase as ChatPhase,
    activeCouncilPersona: parsed.persona ?? s.activeCouncilPersona,
  }));
} else if (ev.event === 'phase' && parsed.phase === 'council_start') {
  setState((s) => ({ ...s, phase: 'thinking', council: [], activeCouncilPersona: null }));
} else if (ev.event === 'council_token') {
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
}
```

Extend `ChatPhase` union: `| 'council_start' | 'council_pm' | 'council_designer' | 'council_engineer' | 'council_moderator'`.

### PhaseIndicator changes

Render council debate above the answerText when `state.council.length > 0`:

```tsx
const PERSONA_LABEL: Record<string, string> = {
  pm: '📋 PM', designer: '🎨 Designer', engineer: '⚙️ Engineer', moderator: '🧑‍⚖️ Moderator',
};

// inside the return:
{state.council.length > 0 && (
  <div className="council">
    {state.council.map((c) => (
      <div
        key={c.persona}
        className={`council__item${state.activeCouncilPersona === c.persona ? ' council__item--active' : ''}`}
      >
        <div className="council__label">{PERSONA_LABEL[c.persona] ?? c.persona}</div>
        <div className="council__text">{c.text}</div>
      </div>
    ))}
  </div>
)}
```

Place this BEFORE the existing `thinkingText` / `answerText` block. When the moderator is producing, also stream `answerText` from the council moderator entries — but to keep things clean: the moderator entry IS the final answer (server stores it that way). When `phase === 'done'`, the moderator's text is what `answerText` should be — but the server already maps moderator → answerText in the persisted Turn. So for the live in-flight bubble: keep showing council entries; don't double-render. When `phase === 'done'`, the in-flight bubble unmounts and the persisted TurnBubble re-renders.

### TurnBubble changes

Detect a council turn by inspecting `turn.skillsUsed?.includes('council-moderator')`. If yes, render the thinking block with persona headers:

```tsx
const isCouncil = (turn.skillsUsed ?? []).includes('council-moderator');
// inside the thinking section:
{turn.aiResponse.thinking && isCouncil && (
  <div className="bubble__thinking council-thinking">
    {turn.aiResponse.thinking.split('### ').filter(Boolean).map((block, i) => (
      <div key={i} className="council__item">
        <div className="council__label">{PERSONA_LABEL[block.split('\n')[0].toLowerCase()] ?? block.split('\n')[0]}</div>
        <div className="council__text">{block.split('\n').slice(1).join('\n').trim()}</div>
      </div>
    ))}
  </div>
)}
{turn.aiResponse.thinking && !isCouncil && (
  <div className="bubble__thinking">{turn.aiResponse.thinking}</div>
)}
```

Wrap the showThinking toggle around both branches.

### ConsultStage changes

Add a council toggle:

```tsx
const [councilEnabled, setCouncilEnabled] = useState(false);

// Pass via send:
await send({ projectId, mode: 'consult', text, attachmentIds, council: councilEnabled });
```

`useChatStream.send` already takes `SendParams`, add `council?: boolean`:

```typescript
export interface SendParams {
  projectId: string;
  mode: 'consult' | 'architect' | 'design';
  text: string;
  attachmentIds?: string[];
  council?: boolean;
}
```

In the fetch body include `council`.

UI for toggle — place in ConsultStage above the transcript (or right next to Composer). Simplest:

```tsx
<div style={{ padding: 'var(--space-2) var(--space-5)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
  <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
    <input type="checkbox" checked={councilEnabled} onChange={(e) => setCouncilEnabled(e.target.checked)} />
    合議模式（PM / Designer / Engineer / Moderator 四方討論）
  </label>
</div>
```

Place between header (n/a) and transcript.

### chat.css additions

```css
.council {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}
.council__item {
  background: var(--bg-elevated);
  border-left: 3px solid var(--border-subtle);
  padding: var(--space-2) var(--space-3);
  border-radius: 4px;
  font-size: 13px;
}
.council__item--active {
  border-left-color: var(--accent);
  background: rgba(124, 92, 191, 0.10);
  box-shadow: 0 0 0 1px var(--border-accent);
}
.council__label {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 4px;
  font-weight: 600;
}
.council__text {
  color: var(--text-secondary);
  white-space: pre-wrap;
  line-height: 1.5;
}
.council-thinking { background: transparent; padding: 0; border: none; max-height: none; }
```

- [ ] Implement all four file changes
- [ ] Build passes
- [ ] Commit: `feat(client): wire council UI — toggle, accordion, persisted view (Plan 12 Task 4)`

---

## Task 5: Verify + push

- All 4 builds green
- Server tests: ~177 (was 173 + 2-4 council)
- Push

---

## Acceptance Criteria

- [ ] 4 built-in council skills exist + load via skill registry
- [ ] councilOrchestrator runs PM → Designer → Engineer → Moderator sequentially, each seeing prior transcripts
- [ ] Chat route accepts `council: true`, only for consult mode
- [ ] SSE emits `phase: council_<persona>` + `council_token` events
- [ ] Turn persists with `skillsUsed: ['council-pm', 'council-designer', 'council-engineer', 'council-moderator']` and `aiResponse.thinking` containing the debate
- [ ] Client `useChatStream` parses council events into `state.council[]`
- [ ] PhaseIndicator renders each persona's bubble live with active highlight
- [ ] TurnBubble re-hydrates council turns from the thinking block
- [ ] ConsultStage toggle controls the flag
- [ ] all builds + tests + push clean

---

## Risks / Notes

1. **4× cost + latency**: a council reply costs ~4× tokens and ~4× wall time. Users opt in per-message via the toggle. M2 could add a "auto-council on complex questions" heuristic.
2. **Persona drift**: with cheap models, personas sometimes give nearly-identical answers. The system prompts have explicit "你不是最終答覆者" anchor lines to keep them in role. If drift persists, M2 can add a refusal heuristic or per-persona model selection.
3. **No mid-stream cancel of council**: cancelling now aborts the current persona call but leaves earlier transcripts in memory only. Plan 17 can add an explicit cancel-and-discard endpoint.
4. **Council in architect/design**: defer to M2. Persona output muddles `<artifact>` extraction (PM/Designer/Engineer would each propose competing artifacts). Single-call path stays for those modes for now.
5. **Skill name collision**: `council-pm` etc. are built-in skills, but they're also invokable via slash commands (`/council-pm`). That's fine — the user could test a single persona. The chat route handles `/skill` as a single-skill forcing, separate from the `council: true` flag.

---

**Plan end. 5 Tasks. Council deliberation visible to the user.**
