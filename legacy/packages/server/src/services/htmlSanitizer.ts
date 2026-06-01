/**
 * HTML Output Sanitizer — fixes common AI-generated HTML issues.
 *
 * Problems this solves:
 * 1. Duplicate <style> tags (AI generates one in <head>, another in <body>)
 * 2. Truncated HTML (token limit cuts off </script></body></html>)
 * 3. Missing showPage function in multi-page prototypes
 */

const SHOW_PAGE_FN = `function showPage(name){document.querySelectorAll('.page').forEach(p=>p.style.display='none');document.getElementById('page-'+name)?.style.setProperty('display','block');document.querySelectorAll('[data-nav]').forEach(l=>l.classList.toggle('active',l.dataset.nav===name));}`;

/**
 * Sanitize AI-generated HTML to fix common structural issues.
 */
export function sanitizeGeneratedHtml(html: string, isMultiPage: boolean = false): string {
  let result = html;

  // 1. Merge duplicate <style> tags into one in <head>
  result = mergeDuplicateStyles(result);

  // 2. Fix truncated HTML — append missing closing tags
  result = fixTruncatedHtml(result);

  // 3. Inject showPage if missing in multi-page prototypes
  if (isMultiPage) {
    result = ensureShowPage(result);
  }

  return result;
}

/**
 * Merge all <style> blocks into a single <style> in <head>.
 */
function mergeDuplicateStyles(html: string): string {
  // Extract all <style> block contents
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  const styleContents: string[] = [];
  let match;

  while ((match = styleRegex.exec(html)) !== null) {
    const content = match[1].trim();
    if (content) styleContents.push(content);
  }

  // If 0 or 1 style blocks, nothing to merge
  if (styleContents.length <= 1) return html;

  // Remove ALL <style> blocks
  let cleaned = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Merge contents and inject single <style> after first tag in <head>
  const mergedCss = styleContents.join('\n\n');
  const headCloseIdx = cleaned.toLowerCase().indexOf('</head>');
  if (headCloseIdx !== -1) {
    cleaned = cleaned.slice(0, headCloseIdx) + `\n<style>\n${mergedCss}\n</style>\n` + cleaned.slice(headCloseIdx);
  } else {
    // No </head> found — prepend style
    cleaned = `<style>\n${mergedCss}\n</style>\n` + cleaned;
  }

  return cleaned;
}

/**
 * Fix truncated HTML by appending missing closing tags.
 */
function fixTruncatedHtml(html: string): string {
  let result = html;
  const lower = result.toLowerCase();

  // Check if we have an open <script> without closing
  const lastScriptOpen = lower.lastIndexOf('<script');
  const lastScriptClose = lower.lastIndexOf('</script>');
  if (lastScriptOpen > lastScriptClose) {
    // Script tag opened but never closed
    result += '\n</script>';
  }

  // Ensure </body> exists
  if (!result.toLowerCase().includes('</body>')) {
    result += '\n</body>';
  }

  // Ensure </html> exists
  if (!result.toLowerCase().includes('</html>')) {
    result += '\n</html>';
  }

  return result;
}

/**
 * Ensure showPage function exists in multi-page prototypes.
 */
function ensureShowPage(html: string): string {
  // Check if showPage is already defined
  if (html.includes('function showPage')) return html;

  // Check if this is actually multi-page (has data-page attributes)
  if (!html.includes('data-page=')) return html;

  // Find the first page name for initialization
  const pageMatch = html.match(/data-page="([^"]+)"/);
  const firstPage = pageMatch ? pageMatch[1] : '';

  const scriptBlock = `\n<script>\n${SHOW_PAGE_FN}\ndocument.addEventListener('DOMContentLoaded',function(){showPage('${firstPage}');});\n</script>`;

  // Inject before </body>
  const bodyCloseIdx = html.toLowerCase().lastIndexOf('</body>');
  if (bodyCloseIdx !== -1) {
    return html.slice(0, bodyCloseIdx) + scriptBlock + '\n' + html.slice(bodyCloseIdx);
  }

  // No </body> — append
  return html + scriptBlock;
}

/**
 * Inject convention color overrides into HTML.
 * Forces :root CSS custom properties to match the design convention.
 */
export function injectConventionColors(html: string, conventionText: string): string {
  if (!conventionText) return html;

  // Extract hex colors from convention — support both PROJECT DESIGN format and legacy format
  const colorMap: Record<string, string> = {};

  // PROJECT DESIGN format: "Primary Color: #XXXXXX"
  const primaryMatch = conventionText.match(/Primary Color:\s*(#[0-9a-fA-F]{3,8})/i);
  if (primaryMatch) colorMap['--primary'] = primaryMatch[1];

  const secondaryMatch = conventionText.match(/Secondary Color:\s*(#[0-9a-fA-F]{3,8})/i);
  if (secondaryMatch) colorMap['--secondary'] = secondaryMatch[1];

  const bgMatch = conventionText.match(/Background Color:\s*(#[0-9a-fA-F]{3,8})/i);
  if (bgMatch) {
    colorMap['--bg'] = bgMatch[1];
    colorMap['--background'] = bgMatch[1];
  }

  // Legacy format: c-purple-600 | #XXXXXX
  if (!colorMap['--primary']) {
    const hexMatches = conventionText.matchAll(/c-purple-600[`\s|]*[`]?#([0-9a-fA-F]{6})/g);
    for (const m of hexMatches) {
      colorMap['--primary'] = `#${m[1]}`;
    }
  }

  // Fallback: explicit CTA color mentions
  if (!colorMap['--primary']) {
    const ctaMatch = conventionText.match(/主要.*?CTA.*?#([0-9a-fA-F]{6})/);
    if (ctaMatch) colorMap['--primary'] = `#${ctaMatch[1]}`;
  }

  if (Object.keys(colorMap).length === 0) return html;

  // Derive hover from primary
  if (colorMap['--primary'] && !colorMap['--primary-hover']) {
    colorMap['--primary-hover'] = colorMap['--primary'] + 'dd';
    colorMap['--header-bg'] = colorMap['--primary'];
    colorMap['--nav-active-bg'] = colorMap['--primary'];
  }

  // Build override CSS
  const overrideVars = Object.entries(colorMap).map(([k, v]) => `  ${k}: ${v} !important;`).join('\n');
  const overrideBlock = `\n<style data-convention-override>\n:root {\n${overrideVars}\n}\n</style>`;

  // Inject before </head>
  const headCloseIdx = html.toLowerCase().indexOf('</head>');
  if (headCloseIdx !== -1) {
    return html.slice(0, headCloseIdx) + overrideBlock + '\n' + html.slice(headCloseIdx);
  }

  // No </head> — inject at start
  return overrideBlock + html;
}
