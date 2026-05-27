import type { SemanticUIAst } from '@designbridge/ast';
import { renderNode } from './renderNode';

export interface VueArtifact {
  filename: string;
  code: string;
}

/** Convert an artifactId slug into a PascalCase `.vue` filename. */
export function vueFilename(artifactId: string): string {
  const pascal = artifactId.split(/[^A-Za-z0-9]+/).filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  return `${pascal || 'Component'}.vue`;
}

/** Render a SemanticUIAst into a template-only Vue 3 SFC (mock — visual only, no script). */
export function renderVue(ast: SemanticUIAst): VueArtifact {
  const body = renderNode(ast.root, 1);
  const code = `<template>\n${body}\n</template>\n`;
  return { filename: vueFilename(ast.artifactId), code };
}
