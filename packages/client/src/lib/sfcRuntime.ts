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
import { parseDocument } from 'htmlparser2';
import type { Element, AnyNode } from 'domhandler';

/**
 * Instrument every element in the template with a `data-db-path` attribute
 * encoding its structural path (element-child indices, '/'-joined). Vue passes
 * unknown attributes through to the rendered DOM, so a click in the preview
 * maps straight back to the template source node — including elements inside
 * v-if branches and v-for repeats (repeats share one path: one template node).
 *
 * ⚠️ Path semantics MUST stay identical to the server-side walker
 * (packages/server/src/services/sfcSurgeon.ts locateByPath): count element
 * nodes only, skip text/comment nodes, root = template's top-level elements.
 */
export function instrumentTemplate(template: string): string {
  try {
    const doc = parseDocument(template, {
      recognizeSelfClosing: true,
      lowerCaseTags: false,
      lowerCaseAttributeNames: false,
      withStartIndices: true,
      withEndIndices: true,
    });
    const isElement = (n: AnyNode): n is Element => n.type === 'tag' || n.type === 'script' || n.type === 'style';
    const insertions: Array<{ at: number; text: string }> = [];

    const walk = (nodes: AnyNode[], prefix: number[]): void => {
      let idx = 0;
      for (const n of nodes) {
        if (!isElement(n)) continue;
        const path = [...prefix, idx];
        if (n.startIndex != null) {
          // Insert right after '<tagname'
          insertions.push({ at: n.startIndex + 1 + n.name.length, text: ` data-db-path="${path.join('/')}"` });
        }
        walk(n.children ?? [], path);
        idx += 1;
      }
    };
    walk(doc.children, []);

    let out = template;
    for (const ins of insertions.sort((a, b) => b.at - a.at)) {
      out = out.slice(0, ins.at) + ins.text + out.slice(ins.at);
    }
    return out;
  } catch {
    return template; // instrumentation is best-effort; preview must never break
  }
}

export function buildSfcIframeSrc(sfc: string): string {
  const { template: rawTemplate, scriptBody, styles } = splitSfc(sfc);
  const template = instrumentTemplate(rawTemplate);

  const rawScript = scriptBody.trim()
    .replace(/^[ \t]*import[^;]+;?\s*$/gm, ''); // strip imports

  // Detect whether the AI wrote Options API (export default {...}) or Composition API
  const isOptionsAPI = rawScript.includes('export default');

  // For Options API: replace 'export default' with a variable assignment so eval works
  // For Composition API: wrap in setup() and auto-expose reactive locals
  const setupBody = isOptionsAPI
    ? rawScript.replace(/export\s+default/, '__componentOpts =')
    : rawScript;

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
  /* 預覽文件內也用細圓角 scrollbar，避免系統預設粗白卷軸毀掉版面 */
  * { scrollbar-width: thin; scrollbar-color: rgba(100, 116, 139, 0.5) transparent; }
  *::-webkit-scrollbar { width: 8px; height: 8px; }
  *::-webkit-scrollbar-track { background: transparent; }
  *::-webkit-scrollbar-thumb {
    background: rgba(100, 116, 139, 0.45);
    border-radius: 999px;
    border: 2px solid transparent;
    background-clip: padding-box;
  }
  *::-webkit-scrollbar-thumb:hover { background: rgba(100, 116, 139, 0.7); background-clip: padding-box; }
  *::-webkit-scrollbar-corner { background: transparent; }
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
    let componentOptions = {};

    ${isOptionsAPI
      ? `// Options API path: the script was transformed to '__componentOpts = { ... }'
    var __componentOpts;
    try {
      ${setupBody}
      if (__componentOpts && typeof __componentOpts === 'object') {
        componentOptions = __componentOpts;
      }
    } catch(__err) {
      console.warn('SFC options eval error:', __err);
    }`
      : `// Composition API path: wrap in setup() and auto-expose reactive locals
    componentOptions = {
      setup: function() {
        ${setupBody}
        const __locals = {};
        ${extractIdentifiers(setupBody).map(id => `try { __locals[${JSON.stringify(id)}] = ${id}; } catch(_) {}`).join('\n        ')}
        return __locals;
      }
    };`
    }

    componentOptions.template = template;
    const app = createApp(componentOptions);
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
<script>
(function() {
  // Only block anchors that would navigate the PARENT window away from the app.
  // - Allow: #hash, javascript:, same-document
  // - Block: absolute URLs (/path, http://, https://) that would reload parent
  document.addEventListener('click', function(e) {
    var anchor = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!anchor) return;
    var href = anchor.getAttribute('href') || '';
    // Allow in-page anchors and void links
    if (!href || href === '#' || href.startsWith('#') || href.startsWith('javascript:')) return;
    // Block anything that would cause a full navigation
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // Bridge mode for annotation / quick-regen interaction
  var _bm = 'browse';
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'set-bridge-mode') {
      _bm = e.data.mode;
      document.body.style.cursor = _bm !== 'browse' ? 'crosshair' : '';
    }
  });
  document.addEventListener('click', function(e) {
    if (_bm === 'browse') return;
    e.preventDefault(); e.stopPropagation();
    var el = e.target, tag = el.tagName.toLowerCase();
    var id = el.id, cls = Array.from(el.classList||[]).slice(0,3).join('.');
    var selector = id ? '#'+id : cls ? '.'+cls : tag;
    var text = (el.textContent||'').trim().slice(0,40);
    // Structural template path from instrumentation (element track). Falls
    // back to the nearest instrumented ancestor when the click landed on a
    // text node wrapper or un-instrumented node.
    var pathEl = el.closest ? el.closest('[data-db-path]') : null;
    var dbPath = pathEl ? pathEl.getAttribute('data-db-path') : null;
    window.parent.postMessage({type:'bridge-click',mode:_bm,selector:selector,tag:tag,text:text,dbPath:dbPath,x:e.clientX,y:e.clientY},'*');
  }, true);
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
