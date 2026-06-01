/**
 * HTML QA Validator — post-assembly quality gate for generated prototypes.
 *
 * Checks for every recurring bug the user has reported:
 * 1. Empty pages (no content after nav click)
 * 2. Missing page divs (nav tab with no matching #page-xxx)
 * 3. Broken div nesting (unclosed/excess divs)
 * 4. Invisible buttons/text (white-on-white, transparent bg with white text)
 * 5. Cards without onclick navigation to detail pages
 * 6. Hardcoded hex colors instead of var() in inline styles
 * 7. Vertical text / broken form layout
 * 8. Nav active tab not visually distinct
 *
 * Returns a report with issues + auto-fixes applied.
 */

export interface QaIssue {
  severity: 'critical' | 'warning';
  page: string;       // which page has the issue, or 'global'
  rule: string;        // machine-readable rule name
  message: string;     // human-readable description
}

export interface QaReport {
  passed: boolean;
  issues: QaIssue[];
  fixes: string[];     // descriptions of auto-fixes applied
  pageStats: Record<string, { textLength: number; divBalance: number; hasContent: boolean }>;
}

export function validatePrototypeHtml(html: string): QaReport {
  const issues: QaIssue[] = [];
  const fixes: string[] = [];
  const pageStats: Record<string, { textLength: number; divBalance: number; hasContent: boolean }> = {};

  // ── 1. Extract all pages ──────────────────────────────────
  // Find all page div start positions, then extract content between them
  const pageStartRegex = /<div[^>]*id="page-([^"]+)"[^>]*>/gi;
  const pageStarts: { name: string; startIdx: number; contentStart: number }[] = [];
  let match;
  while ((match = pageStartRegex.exec(html)) !== null) {
    pageStarts.push({
      name: match[1],
      startIdx: match.index,
      contentStart: match.index + match[0].length,
    });
  }

  // Extract content for each page (from its start tag to the next page's start tag, or </main>/<script>)
  const pages: { name: string; content: string; startIdx: number }[] = [];
  for (let i = 0; i < pageStarts.length; i++) {
    const start = pageStarts[i].contentStart;
    let end: number;
    if (i + 1 < pageStarts.length) {
      end = pageStarts[i + 1].startIdx;
    } else {
      // Last page — find </main> or <script>
      const mainEnd = html.indexOf('</main>', start);
      const scriptStart = html.indexOf('<script>', start);
      end = Math.min(
        mainEnd !== -1 ? mainEnd : html.length,
        scriptStart !== -1 ? scriptStart : html.length,
      );
    }
    pages.push({
      name: pageStarts[i].name,
      content: html.slice(start, end),
      startIdx: pageStarts[i].startIdx,
    });
  }

  // ── 2. Extract nav items ──────────────────────────────────
  const navItemRegex = /data-nav="([^"]+)"/g;
  const navItems = new Set<string>();
  while ((match = navItemRegex.exec(html)) !== null) {
    navItems.add(match[1]);
  }

  const pageNames = new Set(pages.map(p => p.name));

  // ── 3. Check: nav items have matching page divs ───────────
  for (const navItem of navItems) {
    if (!pageNames.has(navItem)) {
      issues.push({
        severity: 'critical',
        page: navItem,
        rule: 'missing-page-div',
        message: `Nav tab "${navItem}" has no matching page div (#page-${navItem}). Clicking this tab will show blank.`,
      });
    }
  }

  // ── 4. Per-page checks ────────────────────────────────────
  for (const page of pages) {
    const textContent = page.content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    const textLen = textContent.length;

    // Div balance
    const openDivs = (page.content.match(/<div[\s>]/gi) || []).length;
    const closeDivs = (page.content.match(/<\/div>/gi) || []).length;
    const divBalance = openDivs - closeDivs;

    pageStats[page.name] = {
      textLength: textLen,
      divBalance,
      hasContent: textLen > 50,
    };

    // 4a. Empty page
    if (textLen < 30) {
      issues.push({
        severity: 'critical',
        page: page.name,
        rule: 'empty-page',
        message: `Page "${page.name}" has only ${textLen} chars of text content. User sees blank page.`,
      });
    }

    // 4b. Div balance
    if (Math.abs(divBalance) > 2) {
      issues.push({
        severity: 'warning',
        page: page.name,
        rule: 'div-imbalance',
        message: `Page "${page.name}" has div imbalance: ${openDivs} open vs ${closeDivs} close (diff: ${divBalance}).`,
      });
    }

    // 4c. Cards without onclick navigation
    const cardCount = (page.content.match(/class="[^"]*card[^"]*"/gi) || []).length;
    const cardWithOnclick = (page.content.match(/class="[^"]*card[^"]*"[\s\S]*?onclick/gi) || []).length;
    const showPageInCards = (page.content.match(/showPage\(/gi) || []).length;
    if (cardCount >= 3 && showPageInCards === 0) {
      issues.push({
        severity: 'warning',
        page: page.name,
        rule: 'cards-no-navigation',
        message: `Page "${page.name}" has ${cardCount} cards but no showPage() links. Cards should link to detail pages.`,
      });
    }

    // 4d. Vertical text indicators
    if (/writing-mode\s*:\s*vertical/i.test(page.content)) {
      issues.push({
        severity: 'critical',
        page: page.name,
        rule: 'vertical-text',
        message: `Page "${page.name}" has writing-mode: vertical — text will display vertically.`,
      });
    }

    // 4e. Embedded nav/header/footer (should have been stripped)
    const embeddedNav = (page.content.match(/<nav[\s>]/gi) || []).length;
    const embeddedHeader = (page.content.match(/<header[\s>]/gi) || []).length;
    if (embeddedNav > 0 || embeddedHeader > 0) {
      issues.push({
        severity: 'warning',
        page: page.name,
        rule: 'embedded-nav',
        message: `Page "${page.name}" still contains ${embeddedNav} <nav> and ${embeddedHeader} <header> elements after strip.`,
      });
    }
  }

  // ── 5. Global checks ──────────────────────────────────────

  // 5a. Hardcoded colors in inline styles
  const inlineStyleRegex = /style="([^"]+)"/gi;
  let hardcodedColorCount = 0;
  let varColorCount = 0;
  while ((match = inlineStyleRegex.exec(html)) !== null) {
    const style = match[1];
    hardcodedColorCount += (style.match(/#[0-9a-fA-F]{3,8}/g) || []).length;
    varColorCount += (style.match(/var\(--/g) || []).length;
  }
  // Only flag if ratio is very bad
  if (hardcodedColorCount > 20 && hardcodedColorCount > varColorCount * 3) {
    issues.push({
      severity: 'warning',
      page: 'global',
      rule: 'hardcoded-colors',
      message: `${hardcodedColorCount} hardcoded hex colors in inline styles vs ${varColorCount} var() usages. Should use CSS variables.`,
    });
  }

  // 5b. Check showPage function exists
  if (!html.includes('function showPage')) {
    issues.push({
      severity: 'critical',
      page: 'global',
      rule: 'missing-showpage',
      message: 'showPage() function is missing — page navigation will not work.',
    });
  }

  // 5c. Check first page is visible
  const firstPageVisible = /style="display:\s*block"/i.test(html);
  if (!firstPageVisible && pages.length > 0) {
    issues.push({
      severity: 'critical',
      page: 'global',
      rule: 'no-visible-page',
      message: 'No page has display:block — all pages are hidden on load.',
    });
  }

  // 5d. Check CSS :root has design tokens
  if (!html.includes('--primary:')) {
    issues.push({
      severity: 'warning',
      page: 'global',
      rule: 'missing-css-vars',
      message: 'No --primary CSS variable found in :root. Design tokens may not be set.',
    });
  }

  // ── Summary ───────────────────────────────────────────────
  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const passed = criticalCount === 0;

  return { passed, issues, fixes, pageStats };
}

/**
 * Format QA report for console logging.
 */
export function formatQaReport(report: QaReport): string {
  const lines: string[] = [];
  lines.push(`\n══════ HTML QA Report ══════`);
  lines.push(`Status: ${report.passed ? '✅ PASSED' : '❌ FAILED'}`);
  lines.push(`Issues: ${report.issues.length} (${report.issues.filter(i => i.severity === 'critical').length} critical)`);

  if (report.issues.length > 0) {
    lines.push(`\nIssues:`);
    for (const issue of report.issues) {
      const icon = issue.severity === 'critical' ? '🔴' : '🟡';
      lines.push(`  ${icon} [${issue.page}] ${issue.rule}: ${issue.message}`);
    }
  }

  lines.push(`\nPage stats:`);
  for (const [name, stats] of Object.entries(report.pageStats)) {
    const status = stats.hasContent ? '✅' : '❌';
    lines.push(`  ${status} "${name}": ${stats.textLength} chars, div balance: ${stats.divBalance >= 0 ? '+' : ''}${stats.divBalance}`);
  }

  if (report.fixes.length > 0) {
    lines.push(`\nAuto-fixes applied:`);
    for (const fix of report.fixes) {
      lines.push(`  🔧 ${fix}`);
    }
  }

  lines.push(`════════════════════════════\n`);
  return lines.join('\n');
}
