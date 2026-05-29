export interface RenderMirrorParams {
  html: string;
  baseHref: string;
}

/**
 * Take a Mirror artifact's stored page.html and prepare it for iframe serving by
 * ensuring a `<base href>` is present so relative `assets/...` URLs resolve
 * under the mirrors route.
 */
export function renderMirror({ html, baseHref }: RenderMirrorParams): string {
  if (/<base\b/i.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1><base href="${baseHref}">`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head><base href="${baseHref}"></head>`);
  }
  return `<head><base href="${baseHref}"></head>${html}`;
}
