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
