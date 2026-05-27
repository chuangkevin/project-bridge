import type { SemanticUIAst } from '@designbridge/ast';
import { buildScriptSetup } from './productionScript';
import { renderProductionNode } from './renderProductionNode';
import { vueFilename, type VueArtifact } from './renderVue';

/** Production backend: full Vue 3 SFC (Composition API + state + events + API stubs). */
export function renderVueProduction(ast: SemanticUIAst): VueArtifact {
  const script = buildScriptSetup(ast.root);
  const template = `<template>\n${renderProductionNode(ast.root, 1)}\n</template>\n`;
  return { filename: vueFilename(ast.artifactId), code: `${script}\n\n${template}` };
}
