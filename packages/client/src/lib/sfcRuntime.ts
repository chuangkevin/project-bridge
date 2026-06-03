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
    window.parent.postMessage({type:'bridge-click',mode:_bm,selector:selector,tag:tag,text:text,x:e.clientX,y:e.clientY},'*');
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
