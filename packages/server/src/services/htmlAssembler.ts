import { GenerationPlan } from './masterAgent';

interface PageFragment {
  name: string;
  html: string;
  success: boolean;
}

/**
 * Assembles page fragments into a complete HTML prototype.
 * Injects: CSS variables, shared CSS, showPage(), navigation, and DOMContentLoaded init.
 */
export function assemblePrototype(
  plan: GenerationPlan,
  fragments: PageFragment[],
): string {
  const successFragments = fragments.filter(f => f.success && f.html);
  const pageNames = successFragments.map(f => f.name);
  const firstPage = pageNames[0] || '';

  // Build navigation HTML
  let navHtml = '';
  if (plan.shell.hasNav && plan.shell.navType !== 'none') {
    const navItems = plan.shell.navItems.length > 0
      ? plan.shell.navItems
      : pageNames;

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

  // Extract any <style> blocks from fragments and merge
  const fragmentStyles: string[] = [];
  const cleanedFragments: string[] = [];
  for (const f of successFragments) {
    let html = f.html;
    // Extract embedded styles
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let match;
    while ((match = styleRegex.exec(html)) !== null) {
      fragmentStyles.push(match[1]);
    }
    // Remove style tags from fragment
    html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    // Fix unbalanced divs — add missing closing tags
    const openCount = (html.match(/<div[\s>]/gi) || []).length;
    const closeCount = (html.match(/<\/div>/gi) || []).length;
    if (openCount > closeCount) {
      const missing = openCount - closeCount;
      html += '</div>'.repeat(missing);
      console.log(`[assembler] Fixed ${missing} unclosed divs in page "${f.name}"`);
    }
    cleanedFragments.push(html);
  }

  // Set first page visible
  const pagesHtml = cleanedFragments.map((html, i) => {
    if (i === 0) {
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

/**
 * Post-assembly navigation validator — fixes broken showPage links.
 * 1. Removes 'page-' prefix from showPage targets (sub-agents sometimes add it)
 * 2. Redirects non-existent page targets to nearest matching page
 * 3. Logs fixes applied
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
    // Try fuzzy match — find page name that shares the most characters
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
body { font-family: var(--font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif); font-size: var(--font-body-size, 15px); line-height: var(--font-body-line-height, 1.6); color: var(--text, #1f2937); background: var(--background, #f9fafb); }
a { color: var(--primary, #3b82f6); text-decoration: none; }
a:hover { opacity: 0.85; }`);

  // Navigation styles based on type
  if (plan.shell.navType === 'top-bar') {
    parts.push(`.top-nav { display: flex; align-items: center; padding: 0 24px; height: 56px; background: var(--surface, #fff); border-bottom: 1px solid var(--border, #e5e7eb); }
.nav-brand { font-weight: 700; font-size: 18px; color: var(--primary, #3b82f6); margin-right: 32px; }
.nav-links { display: flex; gap: 4px; }
.nav-link { padding: 8px 16px; border-radius: var(--radius-md, 8px); color: var(--text-secondary, #6b7280); font-size: 14px; font-weight: 500; transition: all 0.15s ease; }
.nav-link:hover { background: var(--background, #f9fafb); color: var(--text, #1f2937); }
.nav-link.active { background: var(--primary, #3b82f6); color: #fff; }
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
  parts.push(`.container { max-width: 1200px; margin: 0 auto; }
.card { background: var(--surface, #fff); border: 1px solid var(--border, #e5e7eb); border-radius: var(--radius-lg, 12px); padding: var(--spacing-md, 16px); box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.05)); transition: transform 0.18s ease, box-shadow 0.18s ease; }
.card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md, 0 4px 6px rgba(0,0,0,0.07)); }
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
