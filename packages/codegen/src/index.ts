export const CODEGEN_TARGET = 'vue3-tailwind-mock';

export { renderVue, vueFilename } from './renderVue';
export type { VueArtifact } from './renderVue';
export { renderNode } from './renderNode';
export { layoutClasses, styleClasses, classAttr } from './tailwind';
export { escapeHtml, escapeAttr, sanitizeArbitrary, sanitizeClassToken } from './escape';
export { renderVueProduction } from './renderVueProduction';
export { renderProductionNode } from './renderProductionNode';
export { collectStatePaths, buildStateInit } from './productionState';
export { collectApiLoaders, buildScriptSetup } from './productionScript';
export { renderMirror } from './renderMirror';
export type { RenderMirrorParams } from './renderMirror';
