import { GenerationPlan } from './masterAgent';

interface PageFragment {
  name: string;
  html: string;
  success: boolean;
}

/**
 * Assembles page fragments into a complete HTML prototype.
 *
 * KEY DESIGN DECISIONS:
 * 1. We do NOT trust sub-agent HTML structure — we strip the outer page wrapper,
 *    fix inner div balance, then re-wrap with a clean page div.
 * 2. Failed/missing pages get a visible fallback div so nav tabs always work.
 * 3. Nav only references pages that exist (success + fallback).
 * 4. All nav/header/footer elements from sub-agents are aggressively stripped
 *    because the assembler provides its own.
 */
export function assemblePrototype(
  plan: GenerationPlan,
  fragments: PageFragment[],
): string {
  const allPageNames = plan.pages.map(p => p.name);
  const successFragments = fragments.filter(f => f.success && f.html);
  const successNames = new Set(successFragments.map(f => f.name));
  const firstPage = allPageNames[0] || '';

  // Build navigation HTML — include ALL planned pages (success + fallback)
  let navHtml = '';
  if (plan.shell.hasNav && plan.shell.navType !== 'none') {
    const navItems = allPageNames;

    if (plan.shell.navType === 'bottom-tab') {
      navHtml = `<nav class="bottom-tab-bar" data-bridge-id="bottom-tab-bar">
  ${navItems.map(name => `<a href="#" class="tab-item" data-nav="${name}" data-bridge-id="tab-${name}" onclick="showPage('${name}');return false;">${name}</a>`).join('\n  ')}
</nav>`;
    } else if (plan.shell.navType === 'sidebar') {
      navHtml = `<aside class="sidebar-nav" data-bridge-id="sidebar-nav">
  ${navItems.map(name => `<a href="#" class="nav-item" data-nav="${name}" data-bridge-id="nav-${name}" onclick="showPage('${name}');return false;">${name}</a>`).join('\n  ')}
</aside>`;
    } else {
      // top-bar (default)
      navHtml = `<nav class="top-nav" data-bridge-id="top-nav">
  <div class="nav-brand" data-bridge-id="nav-brand">Prototype</div>
  <div class="nav-links">
    ${navItems.map(name => `<a href="#" class="nav-link" data-nav="${name}" data-bridge-id="nav-${name}" onclick="showPage('${name}');return false;">${name}</a>`).join('\n    ')}
  </div>
</nav>`;
    }
  }

  // Build shared CSS
  const sharedCss = buildSharedCss(plan);

  // ── Process each fragment ──────────────────────────────────
  const fragmentStyles: string[] = [];
  const cleanedPages: string[] = [];

  for (const f of successFragments) {
    let html = f.html;

    // 1. Extract embedded <style> blocks → merge into head
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let match;
    while ((match = styleRegex.exec(html)) !== null) {
      fragmentStyles.push(match[1]);
    }
    html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // 2. Strip ALL nav/header/footer — sub-agents should not add these
    //    but they often do. Assembler provides its own.
    html = stripNavHeaderFooter(html);

    // 3. Extract inner content from the page wrapper div
    //    We will re-wrap it ourselves to guarantee correct structure.
    html = extractInnerContent(html, f.name);

    // 4. Fix div balance on the INNER content only
    html = fixDivBalance(html, f.name);

    // 5. Check if content is essentially empty
    const textLen = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().length;
    if (textLen < 20) {
      console.warn(`[assembler] Page "${f.name}" has only ${textLen} chars of text after cleanup — injecting fallback`);
      html = makeFallbackContent(f.name, '此頁面內容生成不完整，請重新生成');
    }

    // 6. Re-wrap with clean page div
    cleanedPages.push(
      `<div class="page" id="page-${f.name}" data-page="${f.name}" style="display:none">\n${html}\n</div>`
    );
  }

  // ── Add fallback divs for failed/missing pages ─────────────
  for (const pageName of allPageNames) {
    if (!successNames.has(pageName)) {
      console.warn(`[assembler] Page "${pageName}" failed generation — adding fallback`);
      cleanedPages.push(
        `<div class="page" id="page-${pageName}" data-page="${pageName}" style="display:none">\n${makeFallbackContent(pageName, '此頁面生成失敗，請重新生成')}\n</div>`
      );
    }
  }

  // Set first page visible
  const pagesHtml = cleanedPages.map((html, i) => {
    // Find the page that matches firstPage
    if (html.includes(`id="page-${firstPage}"`)) {
      return html.replace('style="display:none"', 'style="display:block"');
    }
    return html;
  }).join('\n\n');

  // Assemble
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <base target="_blank">
  <style>
${sharedCss}

/* Fragment-specific styles */
${fragmentStyles.join('\n\n')}
  </style>
</head>
<body>
${navHtml}

<main class="main-content">
${pagesHtml}
</main>

<script>
function showPage(name) {
  document.querySelectorAll('.page').forEach(function(p) { p.style.display = 'none'; });
  var target = document.getElementById('page-' + name);
  if (target) target.style.setProperty('display', 'block');
  document.querySelectorAll('[data-nav]').forEach(function(l) {
    l.classList.toggle('active', l.dataset.nav === name);
  });
}
document.addEventListener('DOMContentLoaded', function() {
  showPage('${firstPage}');
});
// Listen for parent postMessage to switch pages
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'show-page' && e.data.name) {
    showPage(e.data.name);
  }
});
</script>
</body>
</html>`;
}

// ── Helper: strip nav/header/footer from fragment ────────────
function stripNavHeaderFooter(html: string): string {
  // Remove <nav> elements — but limit match to 2000 chars to avoid eating content
  html = html.replace(/<nav[\s>][\s\S]{0,2000}?<\/nav>/gi, '');
  // Remove <header> elements — same 2000 char limit
  html = html.replace(/<header[\s>][\s\S]{0,2000}?<\/header>/gi, '');
  // Remove <footer> elements — same limit
  html = html.replace(/<footer[\s>][\s\S]{0,2000}?<\/footer>/gi, '');
  return html;
}

// ── Helper: extract inner content from page wrapper div ──────
function extractInnerContent(html: string, pageName: string): string {
  // Look for the outermost page wrapper div
  // Pattern: <div ... class="page" ... id="page-XXX" ... >
  const wrapperPattern = /<div[^>]*(?:class="[^"]*page[^"]*"|id="page-)[^>]*>/i;
  const wrapperMatch = html.match(wrapperPattern);

  if (!wrapperMatch) {
    // No page wrapper found — return as-is (sub-agent didn't wrap)
    return html;
  }

  const wrapperStart = html.indexOf(wrapperMatch[0]);
  const innerStart = wrapperStart + wrapperMatch[0].length;

  // Find the matching closing </div> for this wrapper
  // We need to count nested divs to find the right one
  let depth = 1;
  let pos = innerStart;
  const openDiv = /<div[\s>]/gi;
  const closeDiv = /<\/div>/gi;

  // Collect all div open/close positions
  const events: { pos: number; type: 'open' | 'close' }[] = [];
  let m: RegExpExecArray | null;

  openDiv.lastIndex = innerStart;
  while ((m = openDiv.exec(html)) !== null) {
    events.push({ pos: m.index, type: 'open' });
  }
  closeDiv.lastIndex = innerStart;
  while ((m = closeDiv.exec(html)) !== null) {
    events.push({ pos: m.index, type: 'close' });
  }
  events.sort((a, b) => a.pos - b.pos);

  let innerEnd = html.length;
  for (const evt of events) {
    if (evt.type === 'open') {
      depth++;
    } else {
      depth--;
      if (depth === 0) {
        innerEnd = evt.pos;
        break;
      }
    }
  }

  const inner = html.slice(innerStart, innerEnd).trim();
  if (inner.length > 0) {
    return inner;
  }

  // Fallback: if extraction failed, strip the first <div...> and last </div>
  return html;
}

// ── Helper: fix div balance in inner content ─────────────────
function fixDivBalance(html: string, pageName: string): string {
  const openCount = (html.match(/<div[\s>]/gi) || []).length;
  const closeCount = (html.match(/<\/div>/gi) || []).length;

  if (openCount > closeCount) {
    const missing = openCount - closeCount;
    html += '</div>'.repeat(missing);
    console.log(`[assembler] Fixed ${missing} unclosed divs in "${pageName}"`);
  } else if (closeCount > openCount) {
    // Remove excess </div> from the END (safest — doesn't break structure mid-content)
    let excess = closeCount - openCount;
    while (excess > 0) {
      const lastIdx = html.lastIndexOf('</div>');
      if (lastIdx === -1) break;
      html = html.slice(0, lastIdx) + html.slice(lastIdx + 6);
      excess--;
    }
    console.log(`[assembler] Removed ${closeCount - openCount} excess </div> in "${pageName}"`);
  }

  return html;
}

// ── Helper: generate fallback content for empty/failed pages ─
function makeFallbackContent(pageName: string, message: string): string {
  return `<div class="container" style="padding:60px 24px;text-align:center;">
  <div style="font-size:48px;margin-bottom:16px;opacity:0.3;">📄</div>
  <h2 style="color:var(--text-secondary, #6b7280);margin-bottom:12px;">「${pageName}」</h2>
  <p style="color:var(--text-muted, #9ca3af);font-size:14px;">${message}</p>
</div>`;
}

/**
 * Post-assembly navigation validator — fixes broken showPage links.
 */
export function fixNavigation(html: string): { html: string; fixes: string[] } {
  const fixes: string[] = [];

  // Extract valid page names from data-page attributes
  const validPages = new Set<string>();
  const pageMatches = html.match(/data-page="([^"]+)"/g) || [];
  for (const m of pageMatches) {
    const name = m.match(/data-page="([^"]+)"/)?.[1];
    if (name) validPages.add(name);
  }
  if (validPages.size === 0) return { html, fixes };

  const pageList = [...validPages];

  // Fix 1: Remove 'page-' prefix from showPage targets
  let fixed = html.replace(/showPage\('page-([^']+)'\)/g, (match, name) => {
    fixes.push(`Fixed page- prefix: page-${name} → ${name}`);
    return `showPage('${name}')`;
  });

  // Fix 2: Redirect non-existent targets to closest match
  fixed = fixed.replace(/showPage\('([^']+)'\)/g, (match, target) => {
    if (validPages.has(target)) return match; // valid
    let bestMatch = pageList[0];
    let bestScore = 0;
    for (const page of pageList) {
      let score = 0;
      for (const char of target) {
        if (page.includes(char)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = page;
      }
    }
    fixes.push(`Redirected: ${target} → ${bestMatch}`);
    return `showPage('${bestMatch}')`;
  });

  return { html: fixed, fixes };
}

function buildSharedCss(plan: GenerationPlan): string {
  const parts: string[] = [];

  // CSS variables from design tokens
  if (plan.cssVariables) {
    parts.push(plan.cssVariables);
  }

  // CSS reset
  parts.push(`*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { overflow-x: hidden; max-width: 100%; }
body { font-family: var(--font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif); font-size: 15px; line-height: 1.6; color: var(--text, #1f2937); background: var(--background, var(--bg, #f9fafb)); }
a { color: var(--primary, #3b82f6); text-decoration: none; }
a:hover { opacity: 0.85; }
/* Force horizontal text everywhere */
* { writing-mode: horizontal-tb !important; }`);

  // Navigation styles based on type
  if (plan.shell.navType === 'top-bar') {
    parts.push(`.top-nav { display: flex; align-items: center; padding: 0 24px; height: 56px; background: var(--surface, #fff); border-bottom: 1px solid var(--border, #e5e7eb); }
.nav-brand { font-weight: 700; font-size: 18px; color: var(--primary, #3b82f6); margin-right: 32px; }
.nav-links { display: flex; gap: 4px; flex-wrap: wrap; }
.nav-link { padding: 8px 16px; border-radius: var(--radius-md, 8px); color: var(--text-secondary, #6b7280); font-size: 14px; font-weight: 500; transition: all 0.15s ease; }
.nav-link:hover { background: var(--background, #f9fafb); color: var(--text, #1f2937); }
.nav-link.active { background: var(--primary, #3b82f6); color: #fff; font-weight: 600; }
.main-content { padding: 24px; }`);
  } else if (plan.shell.navType === 'bottom-tab') {
    parts.push(`.bottom-tab-bar { position: fixed; bottom: 0; left: 0; right: 0; display: flex; background: var(--surface, #fff); border-top: 1px solid var(--border, #e5e7eb); height: 56px; z-index: 100; }
.tab-item { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 12px; color: var(--text-secondary, #6b7280); transition: color 0.15s ease; }
.tab-item.active { color: var(--primary, #3b82f6); font-weight: 600; }
.main-content { padding: 16px; padding-bottom: 72px; max-width: 480px; margin: 0 auto; }`);
  } else if (plan.shell.navType === 'sidebar') {
    parts.push(`.sidebar-nav { position: fixed; left: 0; top: 0; bottom: 0; width: 240px; background: var(--surface, #fff); border-right: 1px solid var(--border, #e5e7eb); padding: 24px 12px; display: flex; flex-direction: column; gap: 4px; }
.nav-item { padding: 10px 16px; border-radius: var(--radius-md, 8px); color: var(--text-secondary, #6b7280); font-size: 14px; transition: all 0.15s ease; }
.nav-item:hover { background: var(--background, #f9fafb); }
.nav-item.active { background: var(--primary, #3b82f6); color: #fff; font-weight: 500; }
.main-content { margin-left: 240px; padding: 24px; }`);
  } else {
    parts.push(`.main-content { padding: 24px; }`);
  }

  // Shared component classes
  parts.push(`.container { max-width: 1200px; margin: 0 auto; padding: 0 16px; }
.card { background: var(--surface, #fff); border: 1px solid var(--border, #e5e7eb); border-radius: var(--radius-lg, 12px); padding: var(--spacing-md, 16px); box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: transform 0.18s ease, box-shadow 0.18s ease; }
.card:hover { transform: translateY(-2px); box-shadow: 0 4px 6px rgba(0,0,0,0.07); }
.btn-primary { display: inline-flex; align-items: center; justify-content: center; padding: 10px 20px; background: var(--primary, #3b82f6); color: #fff; border: none; border-radius: var(--radius-md, 8px); font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.15s ease; }
.btn-primary:hover { opacity: 0.9; }
.btn-secondary { display: inline-flex; align-items: center; justify-content: center; padding: 10px 20px; background: var(--surface, #fff); color: var(--text, #1f2937); border: 1px solid var(--border, #e5e7eb); border-radius: var(--radius-md, 8px); font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.15s ease; }
.btn-secondary:hover { background: var(--background, #f9fafb); }
input, select, textarea { width: 100%; padding: 10px 12px; border: 1px solid var(--border, #e5e7eb); border-radius: var(--radius-md, 8px); font-size: 14px; font-family: inherit; transition: border-color 0.15s ease; }
input:focus, select:focus, textarea:focus { outline: none; border-color: var(--primary, #3b82f6); box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
.page { min-height: 80vh; }`);

  // User-provided shared CSS from master plan
  if (plan.sharedCss) {
    parts.push(`/* Master agent shared CSS */\n${plan.sharedCss}`);
  }

  return parts.join('\n\n');
}
