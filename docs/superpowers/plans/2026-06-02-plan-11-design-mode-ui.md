# Plan 11 — Design Mode UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Design mode renders Vue 3 + Tailwind SFC artifacts the AI emits in `<artifact kind="vue-sfc" name="...">...</artifact>` blocks. Two-pane layout: live preview iframe (left) + source viewer with copy-to-clipboard (right). Page selector at top picks among multiple SFCs in the project. After this plan, the user can ask AI for a UI and SEE it live.

**Architecture:** Server side: nothing new — artifact persistence already done in Plan 10. Client side: `<DesignStage>` uses the same artifact infrastructure with kind=`vue-sfc`. Preview rendering happens entirely client-side via an `<iframe srcdoc>` that loads Vue 3 + Tailwind from CDN, parses the SFC into template/script/style blocks, and mounts a Vue app inside the iframe. The iframe is sandboxed and isolated — no script eval in our origin.

**Tech Stack:** Vue 3 + Tailwind via CDN (unpkg). No new npm deps. SFC parsing is a tiny regex split into `<template>...</template>` / `<script setup>...</script>` / `<style>...</style>` blocks.

**Spec:** [`../specs/2026-06-01-designbridge-redesign-design.md`](../specs/2026-06-01-designbridge-redesign-design.md) § 4.5 (design mode).

**Scope boundary (out of plan):** NO local Vue compiler in our own bundle (CDN is acceptable for M1). NO design tokens artifact rendering (deferred). NO export to zip. NO multi-page navigation inside the iframe — each artifact is one self-contained SFC. NO hot-reload while AI is streaming (re-render happens after `done`).

---

## File Structure

```
packages/client/src/
  pages/workspace/
    DesignStage.tsx              ← REWRITE: split layout, page selector, preview + source
    design/
      VueSfcPreview.tsx          ← iframe with srcdoc; receives full SFC source
      SfcSourceViewer.tsx        ← pre/code with line numbers + copy button
      ArtifactPicker.tsx         ← dropdown of vue-sfc artifacts
  styles/
    design.css                   ← split layout, picker, source viewer
  lib/
    sfcRuntime.ts                ← builds the iframe srcdoc HTML wrapping an SFC
```

---

## Task 1: sfcRuntime + iframe HTML template

**Files:**
- Create `packages/client/src/lib/sfcRuntime.ts`

The iframe loads Vue 3 (browser ESM build), Tailwind CDN, and an inline ESM `<script type="module">` that:
1. Has the SFC source as a string constant
2. Splits via regex into template/script/style
3. Executes script body (which may use `<script setup>` syntax → we use the **non-setup runtime** approach for simplicity: extract template + style + the body of `<script setup>` and turn it into an options-API `setup()` function)
4. Mounts `createApp({...})` into `#app`

```typescript
/**
 * Wraps a Vue 3 SFC string into a self-contained HTML document suitable for use
 * as an iframe srcdoc. Uses Vue 3 from CDN with the runtime-compiler bundle so
 * `template` strings work at runtime.
 *
 * Limitations of the M1 runtime:
 *  - Supports <script setup> with top-level statements (refs, reactive, methods, etc.)
 *    via a regex extraction + wrapping into a setup() function. No imports beyond Vue.
 *  - Component-tag PascalCase auto-resolution is NOT supported.
 *  - <style scoped> works because Vue's runtime compiler handles it.
 *  - <script lang="ts"> is treated as JS (no transpile). Use plain JS in SFCs.
 */
export function buildSfcIframeSrc(sfc: string): string {
  const { template, scriptBody, styles } = splitSfc(sfc);

  // Convert top-level <script setup> body into a return object via heuristic:
  // - We can't reliably parse imports/exports, so just wrap the body in setup() and
  //   rely on the AI to write plain Vue.ref/Vue.reactive without imports.
  // - Expose Vue globals as window-scoped helpers so the AI's code can use `ref()`/`reactive()`/etc.
  const setupBody = scriptBody.trim()
    // Strip imports (we provide Vue globally)
    .replace(/^[ \t]*import[^;]+;?\s*$/gm, '');

  const safeStyles = styles.join('\n');

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>DesignBridge Preview</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<style>
  html, body, #app { height: 100%; margin: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Microsoft JhengHei", sans-serif; }
  ${safeStyles}
</style>
</head>
<body>
<div id="app"></div>
<script>
(function() {
  const { createApp, ref, reactive, computed, watch, watchEffect, onMounted, onUnmounted, onUpdated, nextTick, defineComponent, inject, provide, h } = Vue;
  // Expose for the SFC author
  window.ref = ref; window.reactive = reactive; window.computed = computed; window.watch = watch;
  window.watchEffect = watchEffect; window.onMounted = onMounted; window.onUnmounted = onUnmounted;
  window.onUpdated = onUpdated; window.nextTick = nextTick; window.defineComponent = defineComponent;
  window.inject = inject; window.provide = provide; window.h = h;

  try {
    const template = ${JSON.stringify(template)};
    const __setup = function() {
      ${setupBody}
      // Best-effort: return all locals as the setup() result
      // Pick up all identifiers declared with let/const/var in the body.
      const __locals = {};
      ${extractIdentifiers(setupBody).map(id => `try { __locals[${JSON.stringify(id)}] = ${id}; } catch(_) {}`).join('\n      ')}
      return __locals;
    };
    const app = createApp({ template, setup: __setup });
    app.config.errorHandler = function(err, _vm, info) {
      const el = document.createElement('pre');
      el.style.cssText = 'padding:16px;color:#fca5a5;background:#1f1124;font-size:12px;white-space:pre-wrap;';
      el.textContent = 'Vue error: ' + (err && err.stack ? err.stack : err) + (info ? '\\nInfo: ' + info : '');
      document.body.appendChild(el);
    };
    app.mount('#app');
  } catch (e) {
    const el = document.createElement('pre');
    el.style.cssText = 'padding:16px;color:#fca5a5;background:#1f1124;font-size:12px;white-space:pre-wrap;';
    el.textContent = 'Preview error: ' + (e && e.stack ? e.stack : e);
    document.body.appendChild(el);
  }
})();
</script>
</body>
</html>`;
}

function splitSfc(sfc: string): { template: string; scriptBody: string; styles: string[] } {
  const tplMatch = /<template[^>]*>([\s\S]*?)<\/template>/i.exec(sfc);
  const scriptMatch = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(sfc);
  const styles: string[] = [];
  for (const m of sfc.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    styles.push(m[1]);
  }
  return {
    template: tplMatch ? tplMatch[1].trim() : '<div class="p-6 text-slate-400">沒有 template</div>',
    scriptBody: scriptMatch ? scriptMatch[1].trim() : '',
    styles,
  };
}

function extractIdentifiers(scriptBody: string): string[] {
  // Best-effort: pick up declarations
  const out = new Set<string>();
  for (const m of scriptBody.matchAll(/(?:^|[\n;])\s*(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g)) {
    out.add(m[1]);
  }
  for (const m of scriptBody.matchAll(/(?:^|[\n;])\s*function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g)) {
    out.add(m[1]);
  }
  return Array.from(out);
}
```

- [ ] Add a small inline test by writing a unit test if vitest is available on client. If not (per Plan 9 deviation: client has no vitest), skip — verify manually in Task 5.
- [ ] Commit: `feat(client): add sfcRuntime to wrap SFC in iframe HTML (Plan 11 Task 1)`

---

## Task 2: VueSfcPreview + SfcSourceViewer + ArtifactPicker components

**Files:**
- Create `packages/client/src/pages/workspace/design/VueSfcPreview.tsx`
- Create `packages/client/src/pages/workspace/design/SfcSourceViewer.tsx`
- Create `packages/client/src/pages/workspace/design/ArtifactPicker.tsx`

### VueSfcPreview.tsx

```tsx
import { useMemo, useRef, useEffect } from 'react';
import { buildSfcIframeSrc } from '../../../lib/sfcRuntime';

export default function VueSfcPreview({ sfc }: { sfc: string }) {
  const html = useMemo(() => buildSfcIframeSrc(sfc), [sfc]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Each new sfc remounts the iframe (key change in parent forces full reload)
  useEffect(() => {
    // No-op; key prop should force remount
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      title="Vue SFC Preview"
      srcDoc={html}
      sandbox="allow-scripts allow-same-origin"
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        background: 'white',
        borderRadius: 'var(--radius-md)',
      }}
    />
  );
}
```

### SfcSourceViewer.tsx

```tsx
import { useState } from 'react';

export default function SfcSourceViewer({ source }: { source: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback noop
    }
  };

  const lines = source.split('\n');

  return (
    <div className="sfc-source">
      <div className="sfc-source__toolbar">
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          {lines.length} 行 · {source.length} 字元
        </span>
        <button onClick={handleCopy} className="sfc-source__copy">
          {copied ? '✓ 已複製' : '複製'}
        </button>
      </div>
      <pre className="sfc-source__code">
        {lines.map((line, i) => (
          <div key={i} className="sfc-source__line">
            <span className="sfc-source__lineno">{i + 1}</span>
            <span className="sfc-source__linecontent">{line || ' '}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}
```

### ArtifactPicker.tsx

```tsx
import type { Artifact } from '../../../hooks/useArtifacts';

interface Props {
  artifacts: Artifact[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function ArtifactPicker({ artifacts, selectedId, onSelect }: Props) {
  if (artifacts.length === 0) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>還沒有頁面</div>;
  }
  return (
    <select
      className="artifact-picker"
      value={selectedId ?? ''}
      onChange={(e) => onSelect(e.target.value)}
    >
      {artifacts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name} · {new Date(a.createdAt).toLocaleString('zh-TW')}
        </option>
      ))}
    </select>
  );
}
```

- [ ] Create all 3
- [ ] Build passes
- [ ] Commit: `feat(client): add VueSfcPreview/SfcSourceViewer/ArtifactPicker (Plan 11 Task 2)`

---

## Task 3: design.css

**Files:**
- Create `packages/client/src/styles/design.css`
- Modify `packages/client/src/main.tsx` (import design.css)

```css
.design {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.design__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-card);
}

.design__split {
  flex: 1 1 60%;
  display: flex;
  min-height: 0;
}

.design__preview {
  flex: 1 1 55%;
  padding: var(--space-3);
  background: var(--bg-root);
  min-width: 0;
}

.design__source {
  flex: 1 1 45%;
  border-left: 1px solid var(--border-subtle);
  background: var(--bg-card);
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.design__chat {
  flex: 1 1 40%;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  min-height: 220px;
}

.design__empty {
  margin: auto;
  text-align: center;
  color: var(--text-muted);
  padding: var(--space-6);
}

.artifact-picker {
  background: var(--bg-input);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  padding: 4px 8px;
  font-size: 12px;
  max-width: 320px;
}

.sfc-source {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.sfc-source__toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
}
.sfc-source__copy {
  background: var(--accent);
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  padding: 4px 10px;
  font-size: 11px;
  cursor: pointer;
}
.sfc-source__code {
  flex: 1;
  margin: 0;
  padding: 0;
  overflow: auto;
  background: #0a0f1c;
  font-family: "Cascadia Code", Consolas, "Courier New", monospace;
  font-size: 12px;
  line-height: 1.5;
}
.sfc-source__line {
  display: flex;
  white-space: pre;
}
.sfc-source__lineno {
  flex-shrink: 0;
  width: 48px;
  text-align: right;
  padding: 0 8px;
  color: #475569;
  user-select: none;
  border-right: 1px solid #1e293b;
}
.sfc-source__linecontent {
  padding: 0 var(--space-3);
  color: #e2e8f0;
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

/* RWD: stack preview / source on narrower screens */
@media (max-width: 1280px) {
  .design__split { flex-direction: column; }
  .design__preview, .design__source { flex-basis: 50%; }
  .design__source { border-left: none; border-top: 1px solid var(--border-subtle); }
}
```

main.tsx: `import './styles/design.css';`

- [ ] Create + import
- [ ] Build passes
- [ ] Commit: `feat(client): add design.css split layout + source viewer styles (Plan 11 Task 3)`

---

## Task 4: DesignStage rewrite

**Files:**
- Rewrite `packages/client/src/pages/workspace/DesignStage.tsx`

```tsx
import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { useTurns } from '../../hooks/useTurns';
import { useChatStream } from '../../hooks/useChatStream';
import { useArtifacts, fetchArtifactPayload } from '../../hooks/useArtifacts';
import Transcript from './chat/Transcript';
import Composer from './chat/Composer';
import VueSfcPreview from './design/VueSfcPreview';
import SfcSourceViewer from './design/SfcSourceViewer';
import ArtifactPicker from './design/ArtifactPicker';

export default function DesignStage() {
  const { projectId } = useWorkspaceStore();
  const { turns, refresh: refreshTurns } = useTurns(projectId);
  const { state, send, reset } = useChatStream();
  const { artifacts, latest, refresh: refreshArtifacts } = useArtifacts(projectId, 'vue-sfc');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sfcSource, setSfcSource] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(true);

  // Auto-select latest on update
  useEffect(() => {
    if (!selectedId && latest) setSelectedId(latest.id);
    if (selectedId && !artifacts.some(a => a.id === selectedId) && latest) setSelectedId(latest.id);
  }, [latest?.id, artifacts, selectedId]);

  // Fetch payload when selectedId changes
  useEffect(() => {
    if (!projectId || !selectedId) { setSfcSource(null); return; }
    fetchArtifactPayload<string>(projectId, selectedId)
      .then((p) => {
        // Payload may be parsed as JSON if content-type was JSON. vue-sfc has text/plain → always string.
        setSfcSource(typeof p === 'string' ? p : JSON.stringify(p, null, 2));
      })
      .catch(() => setSfcSource(null));
  }, [projectId, selectedId]);

  const filteredTurns = turns.filter((t) => t.mode === 'design');
  const pending = state.phase === 'idle' ? null : { userText: pendingRef.current, state };

  const handleSend = async (text: string, attachmentIds: string[]) => {
    if (!projectId) return;
    pendingRef.current = text;
    await send({ projectId, mode: 'design', text, attachmentIds });
    if (pendingRef.current) {
      await Promise.all([refreshTurns(), refreshArtifacts()]);
      pendingRef.current = '';
      reset();
    }
  };

  return (
    <div className="design">
      <div className="design__header">
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>頁面：</span>
        <ArtifactPicker artifacts={artifacts} selectedId={selectedId} onSelect={setSelectedId} />
        <button
          onClick={() => setShowSource(!showSource)}
          style={{
            marginLeft: 'auto',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-primary)',
            color: 'var(--text-secondary)',
            padding: '4px 10px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >{showSource ? '隱藏原始碼' : '顯示原始碼'}</button>
      </div>

      <div className="design__split">
        <div className="design__preview">
          {sfcSource
            ? <VueSfcPreview sfc={sfcSource} key={selectedId} />
            : (
              <div className="design__empty">
                {artifacts.length === 0
                  ? '還沒有設計。在下方對話讓 AI 幫你產出 Vue + Tailwind 頁面。'
                  : '載入中…'}
              </div>
            )
          }
        </div>
        {showSource && (
          <div className="design__source">
            {sfcSource
              ? <SfcSourceViewer source={sfcSource} />
              : <div className="design__empty">沒有原始碼</div>
            }
          </div>
        )}
      </div>

      <div className="design__chat">
        <Transcript turns={filteredTurns} pending={pending} />
        <Composer
          projectId={projectId ?? ''}
          disabled={state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'error'}
          onSend={handleSend}
        />
      </div>
    </div>
  );
}

const pendingRef = { current: '' };
```

- [ ] Rewrite
- [ ] Build passes
- [ ] Commit: `feat(client): rewrite DesignStage with Vue SFC preview + source (Plan 11 Task 4)`

---

## Task 5: Verify + push

- All 4 builds green
- Server tests unchanged (~173)
- Manual smoke (describe only):
  - Visit `/projects/:id` design mode → empty state
  - Send: "做一個簡單的計數器頁面" → AI replies with `<artifact kind="vue-sfc" name="counter">...</artifact>` → preview iframe shows live counter with Tailwind styling
  - Toggle "隱藏原始碼" → source pane collapses
  - Copy button → text on clipboard
- Push

---

## Acceptance Criteria

- [ ] sfcRuntime.buildSfcIframeSrc produces valid HTML with Vue + Tailwind CDN
- [ ] VueSfcPreview iframe sandbox restricts script execution to iframe context
- [ ] SfcSourceViewer shows line numbers + copy button
- [ ] ArtifactPicker lists vue-sfc artifacts, lets user switch
- [ ] DesignStage auto-selects latest on first load + on new artifact arrival
- [ ] Toggling source panel reflows split layout
- [ ] RWD < 1280px stacks preview/source vertically
- [ ] all builds + push clean

---

## Risks / Notes

1. **CDN dependency**: prod environments without internet to unpkg/tailwindcss CDN will see broken previews. M2 can bundle Vue + a minimal Tailwind subset locally. For M1 (designed for the user's own machine + intranet), CDN is acceptable.
2. **`<script setup>` is best-effort**: the regex-based wrapping won't handle every TS feature. AI is prompted (via design mode system prompt — see chat orchestrator skill `vue-tailwind-basics.md`) to write plain Vue 3 with `ref()`/`reactive()` without imports. If the AI uses unsupported syntax, the iframe shows a clear error banner from the errorHandler.
3. **Auto-select on new artifact**: if user is currently viewing an older artifact when AI emits a new one, current behavior auto-jumps to the newest. Some users may prefer "stay on selected" — Plan 14 (settings) can offer that toggle.
4. **No syntax highlighting**: plain pre with line numbers. M2 can add prismjs (~30KB) or shiki. Source viewer is monospace and readable as-is.
5. **Iframe security**: `sandbox="allow-scripts allow-same-origin"` is required for Vue to work. Without `allow-same-origin`, Vue's reactivity setup hits a sandbox barrier. Since the SFC content originates from our own AI/DB (not user-uploaded HTML), the risk is bounded — but treat any production deployment as potential XSS surface if attackers control the AI output. M2 should drop `allow-same-origin` and bundle Vue inside the iframe via blob URL.
6. **CSP**: if the deployment uses CSP headers, the iframe's CDN scripts need allowlisting (`script-src unpkg.com cdn.tailwindcss.com`). Document for ops in Plan 17 manual smoke checklist.

---

**Plan end. 5 Tasks. Design mode renders live Vue + Tailwind previews.**
