export const CODEGEN_TARGET = 'vue3-tailwind-mock';

export { renderVue, vueFilename } from './renderVue';
export type { VueArtifact } from './renderVue';
export { renderNode } from './renderNode';
export { layoutClasses, styleClasses, classAttr } from './tailwind';
export { escapeHtml, escapeAttr, sanitizeArbitrary } from './escape';
