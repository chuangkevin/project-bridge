/** Extract the inner HTML of a `<template>...</template>` SFC. Falls back to the raw input. */
export function extractTemplateInner(vueCode: string): string {
  const m = vueCode.match(/<template>([\s\S]*?)<\/template>/i);
  return m ? m[1] : vueCode;
}

/**
 * Build a self-contained HTML document for the sandboxed preview iframe: the generated template
 * markup + the Tailwind Play CDN so arbitrary Tailwind classes render. Mock output is static, so
 * no Vue runtime is needed (interactivity is M2). Render the iframe with `sandbox`.
 */
export function buildPreviewHtml(vueCode: string): string {
  const body = extractTemplateInner(vueCode);
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8" />',
    '<script src="https://cdn.tailwindcss.com"></script>',
    '</head><body>',
    body,
    '</body></html>',
  ].join('\n');
}
