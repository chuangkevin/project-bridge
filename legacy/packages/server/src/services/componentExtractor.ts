import { parse } from 'node-html-parser';

export function extractComponent(html: string, bridgeId: string): string | null {
  try {
    const root = parse(html);
    const el = root.querySelector(`[data-bridge-id="${bridgeId}"]`);
    return el ? el.outerHTML : null;
  } catch {
    return null;
  }
}

export function replaceComponent(html: string, bridgeId: string, newHtml: string): string {
  try {
    // Ensure bridge-id is preserved in new HTML
    if (!newHtml.includes(`data-bridge-id="${bridgeId}"`)) {
      // Try to inject it onto the root element
      newHtml = newHtml.replace(/^(<\w+)(\s|>)/, `$1 data-bridge-id="${bridgeId}"$2`);
    }
    const root = parse(html);
    const el = root.querySelector(`[data-bridge-id="${bridgeId}"]`);
    if (!el) return html;
    el.replaceWith(parse(newHtml).firstChild as any);
    return root.toString();
  } catch {
    return html;
  }
}
