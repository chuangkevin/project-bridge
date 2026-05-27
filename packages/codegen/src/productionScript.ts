import type { ComponentNode, EventBinding, Action } from '@designbridge/ast';
import { collectStatePaths, buildStateInit } from './productionState';

const ident = (s: string): string => s.replace(/[^A-Za-z0-9_]/g, '_');

export interface ApiLoader { nodeId: string; propKey: string; method: string; url: string; fnName: string; refName: string; }

/** api-source bindings → loader descriptors. */
export function collectApiLoaders(root: ComponentNode): ApiLoader[] {
  const out: ApiLoader[] = [];
  const walk = (n: ComponentNode): void => {
    for (const b of n.bindings) {
      if (b.source === 'api' && b.endpoint) {
        out.push({ nodeId: n.id, propKey: b.propKey, method: b.endpoint.method, url: b.endpoint.url,
          fnName: `load_${ident(n.id)}_${ident(b.propKey)}`, refName: `${ident(n.id)}_${ident(b.propKey)}` });
      }
    }
    for (const c of n.children) walk(c);
  };
  walk(root);
  return out;
}

interface HandlerDesc { fnName: string; body: string[]; }

function handlerBody(action: Action): string[] {
  switch (action.kind) {
    case 'navigate': return [`  // TODO: wire router — navigate to '${action.to}'`, `  console.log('navigate', '${action.to}');`];
    case 'api': return [`  // TODO: real fetch — ${action.endpoint.method} ${action.endpoint.url}` + (action.payloadFromState ? ` (payload: state.${action.payloadFromState})` : ''), `  // const res = await fetch('${action.endpoint.url}', { method: '${action.endpoint.method}' });`];
    case 'setState': return [`  state.${action.path} = ${action.valueFromEvent ? '($event.target as HTMLInputElement)?.value' : JSON.stringify(action.staticValue ?? null)};`];
    case 'openModal': return [`  state.${ident(action.modalId)}_open = true;`];
    case 'closeModal': return [`  state.${action.modalId ? ident(action.modalId) + '_open' : 'modal_open'} = false;`];
    case 'custom': return [`  // TODO: custom action '${action.name}'`];
    default: return ['  // unknown action'];
  }
}

function collectHandlers(root: ComponentNode): HandlerDesc[] {
  const out: HandlerDesc[] = [];
  const walk = (n: ComponentNode): void => {
    n.events.forEach((e: EventBinding) => out.push({ fnName: `on_${ident(n.id)}_${ident(e.event)}`, body: handlerBody(e.action) }));
    for (const c of n.children) walk(c);
  };
  walk(root);
  return out;
}

/** Assemble the <script setup> block: vue imports + reactive state + api loader stubs + handlers. */
export function buildScriptSetup(root: ComponentNode): string {
  const statePaths = collectStatePaths(root);
  const loaders = collectApiLoaders(root);
  const handlers = collectHandlers(root);

  const vueImports = ['reactive'];
  if (loaders.length) vueImports.push('ref', 'onMounted');

  const lines: string[] = ['<script setup>', `import { ${vueImports.join(', ')} } from 'vue';`, ''];
  lines.push(`const state = reactive(${JSON.stringify(buildStateInit(statePaths), null, 2)});`, '');

  for (const l of loaders) {
    lines.push(`const ${l.refName} = ref(null); // ${l.method} ${l.url}`);
    lines.push(`async function ${l.fnName}() {`, `  // TODO: real fetch — ${l.method} ${l.url}`, `  // ${l.refName}.value = await (await fetch('${l.url}')).json();`, `}`);
  }
  if (loaders.length) { lines.push('', `onMounted(() => { ${loaders.map(l => l.fnName + '()').join('; ')}; });`, ''); }

  for (const h of handlers) { lines.push(`function ${h.fnName}($event) {`, ...h.body, `}`, ''); }

  lines.push('</script>');
  return lines.join('\n');
}
