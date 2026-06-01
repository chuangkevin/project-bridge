/**
 * Prototype Quality Validator — checks generated HTML against analysis results.
 *
 * Non-blocking: logs warnings but never prevents prototype storage.
 * Used for quality monitoring and debugging.
 */

export interface NavigationIssue {
  type: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface NavigationValidationResult {
  valid: boolean;
  issues: NavigationIssue[];
}

export interface ValidationResult {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    detail: string;
  }>;
  navigationIssues?: NavigationIssue[];
}

/**
 * Validate navigation integrity of a generated prototype.
 * - Every showPage('X') call must have a matching data-page="X" div
 * - No orphan pages (unreachable from any other page)
 * - No dead-end pages (no outgoing navigation, except the last page)
 * - Tab/dropdown state switches must have matching targets
 */
export function validateNavigation(html: string): NavigationValidationResult {
  const issues: NavigationIssue[] = [];

  // Parse all data-page attributes (declared pages)
  const pageRegex = /data-page="([^"]+)"/g;
  const declaredPages = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = pageRegex.exec(html)) !== null) {
    declaredPages.add(m[1]);
  }

  // Parse all showPage('X') and showPage("X") calls (navigation targets)
  const showPageRegex = /showPage\(['"]([^'"]+)['"]\)/g;
  const navTargets = new Map<string, Set<string>>(); // source context -> targets
  const allTargets = new Set<string>();
  const targetSources = new Map<string, string[]>(); // target -> source pages

  // Build a map of which page each showPage call lives in
  // Split by data-page sections
  const pageSections: { name: string; content: string }[] = [];
  const pageDivRegex = /data-page="([^"]+)"[^>]*>([\s\S]*?)(?=<div[^>]*data-page=|<\/body>|<\/html>|$)/g;
  let pm: RegExpExecArray | null;
  while ((pm = pageDivRegex.exec(html)) !== null) {
    pageSections.push({ name: pm[1], content: pm[2] });
  }

  // Collect showPage calls per page section
  const pagesWithOutgoing = new Set<string>();
  const pagesWithIncoming = new Set<string>();

  for (const section of pageSections) {
    const sectionTargets = new Set<string>();
    const spRegex = /showPage\(['"]([^'"]+)['"]\)/g;
    let sm: RegExpExecArray | null;
    while ((sm = spRegex.exec(section.content)) !== null) {
      const target = sm[1];
      sectionTargets.add(target);
      allTargets.add(target);
      pagesWithOutgoing.add(section.name);
      pagesWithIncoming.add(target);

      if (!targetSources.has(target)) targetSources.set(target, []);
      targetSources.get(target)!.push(section.name);
    }
    navTargets.set(section.name, sectionTargets);
  }

  // Also collect showPage calls from global script (outside page sections)
  while ((m = showPageRegex.exec(html)) !== null) {
    allTargets.add(m[1]);
  }

  // Check 1: Missing targets — showPage('X') with no matching data-page="X"
  for (const target of allTargets) {
    if (!declaredPages.has(target)) {
      issues.push({
        type: 'missing-target',
        message: `showPage('${target}') called but no element with data-page="${target}" exists`,
        severity: 'error',
      });
    }
  }

  // Check 2: Orphan pages — declared but never referenced by any showPage call
  if (declaredPages.size > 1) {
    const pageArray = Array.from(declaredPages);
    const firstPage = pageArray[0]; // First page is entry point, not orphan
    for (const page of declaredPages) {
      if (page === firstPage) continue; // Entry page is reachable by default
      if (!pagesWithIncoming.has(page)) {
        issues.push({
          type: 'orphan-page',
          message: `Page "${page}" is declared but unreachable — no showPage('${page}') call found`,
          severity: 'warning',
        });
      }
    }
  }

  // Check 3: Dead-end pages — no outgoing navigation (except the last page)
  if (declaredPages.size > 1) {
    const pageArray = Array.from(declaredPages);
    const lastPage = pageArray[pageArray.length - 1];
    for (const page of declaredPages) {
      if (page === lastPage) continue; // Last page is allowed to be a dead-end
      if (!pagesWithOutgoing.has(page)) {
        issues.push({
          type: 'dead-end',
          message: `Page "${page}" has no outgoing navigation (no showPage calls)`,
          severity: 'warning',
        });
      }
    }
  }

  // Check 4: Tab/dropdown state switches — data-tab-target or data-switch-target with missing targets
  const tabTargetRegex = /data-(?:tab|switch)-target="([^"]+)"/g;
  while ((m = tabTargetRegex.exec(html)) !== null) {
    const target = m[1];
    // Check if there's a matching data-tab-panel or element with that id
    const panelRegex = new RegExp(`data-(?:tab|switch)-panel="${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g');
    const idRegex = new RegExp(`id="${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g');
    if (!panelRegex.test(html) && !idRegex.test(html)) {
      issues.push({
        type: 'missing-tab-target',
        message: `Tab/switch target "${target}" has no matching panel or element`,
        severity: 'error',
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Validate a generated prototype against the analysis result and convention.
 */
export function validatePrototype(
  html: string,
  analysisResult: any | null,
  conventionPrimaryColor: string | null,
  isMultiPage: boolean,
): ValidationResult {
  const checks: ValidationResult['checks'] = [];

  // 1. Check HTML completeness
  const hasDoctype = /<!doctype html/i.test(html);
  const hasCloseHtml = /<\/html>/i.test(html);
  const hasCloseScript = !html.includes('<script') || /<\/script>/i.test(html);
  checks.push({
    name: 'html-complete',
    passed: hasDoctype && hasCloseHtml && hasCloseScript,
    detail: hasDoctype && hasCloseHtml && hasCloseScript
      ? 'HTML is complete'
      : `Missing: ${!hasDoctype ? '<!DOCTYPE> ' : ''}${!hasCloseHtml ? '</html> ' : ''}${!hasCloseScript ? '</script>' : ''}`,
  });

  // 2. Check data-bridge-id presence
  const bridgeIds = (html.match(/data-bridge-id="/g) || []).length;
  checks.push({
    name: 'bridge-ids',
    passed: bridgeIds >= 5,
    detail: `${bridgeIds} data-bridge-id attributes found`,
  });

  // 3. Check pages from analysis
  if (analysisResult?.pages?.length > 0 && isMultiPage) {
    const analysisPages: string[] = analysisResult.pages.map((p: any) => p.name);
    const missingPages: string[] = [];

    for (const pageName of analysisPages) {
      if (!html.includes(pageName)) {
        missingPages.push(pageName);
      }
    }

    checks.push({
      name: 'pages-present',
      passed: missingPages.length === 0,
      detail: missingPages.length === 0
        ? `All ${analysisPages.length} pages found`
        : `Missing pages: ${missingPages.join(', ')}`,
    });

    // Check page content length
    for (const pageName of analysisPages) {
      const pageRegex = new RegExp(`data-page="${pageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>([\\s\\S]*?)(?=<div[^>]*data-page=|$)`);
      const match = html.match(pageRegex);
      if (match) {
        const contentLen = match[1].length;
        const isPlaceholder = contentLen < 200 || /此處將顯示|placeholder|lorem/i.test(match[1]);
        checks.push({
          name: `page-content-${pageName}`,
          passed: !isPlaceholder,
          detail: isPlaceholder ? `Page "${pageName}" has only ${contentLen} chars (placeholder)` : `Page "${pageName}" has ${contentLen} chars`,
        });
      }
    }
  }

  // 4. Check showPage function for multi-page
  if (isMultiPage) {
    const hasShowPage = html.includes('showPage');
    checks.push({
      name: 'show-page',
      passed: hasShowPage,
      detail: hasShowPage ? 'showPage function present' : 'showPage function MISSING',
    });
  }

  // 5. Check convention color
  if (conventionPrimaryColor) {
    const colorLower = conventionPrimaryColor.toLowerCase();
    const hasColor = html.toLowerCase().includes(colorLower);
    checks.push({
      name: 'convention-color',
      passed: hasColor,
      detail: hasColor
        ? `Convention color ${conventionPrimaryColor} found`
        : `Convention color ${conventionPrimaryColor} NOT found in HTML`,
    });
  }

  // 6. Check navigation flow from analysis
  if (analysisResult?.pages?.length > 0 && isMultiPage) {
    const navIssues: string[] = [];
    for (const page of analysisResult.pages) {
      if (page.navigationTo?.length > 0) {
        for (const target of page.navigationTo) {
          const navCall = `showPage('${target}')`;
          if (!html.includes(navCall)) {
            // Try URL-encoded or alternative formats
            const altCall = `showPage("${target}")`;
            if (!html.includes(altCall)) {
              navIssues.push(`${page.name} → ${target}`);
            }
          }
        }
      }
    }
    checks.push({
      name: 'navigation-flow',
      passed: navIssues.length === 0,
      detail: navIssues.length === 0
        ? 'All navigation flows present'
        : `Missing navigation: ${navIssues.join(', ')}`,
    });
  }

  // 7. Navigation validation (for multi-page prototypes)
  let navigationIssues: NavigationIssue[] | undefined;
  if (isMultiPage) {
    const navResult = validateNavigation(html);
    navigationIssues = navResult.issues;

    const navErrors = navResult.issues.filter(i => i.severity === 'error');
    const navWarnings = navResult.issues.filter(i => i.severity === 'warning');
    checks.push({
      name: 'navigation-integrity',
      passed: navErrors.length === 0,
      detail: navResult.valid
        ? 'Navigation integrity OK'
        : `${navErrors.length} error(s), ${navWarnings.length} warning(s): ${navResult.issues.map(i => i.message).join('; ')}`,
    });
  }

  const passed = checks.every(c => c.passed);
  return { passed, checks, navigationIssues };
}

/**
 * Log validation results. Called from chat.ts after generation.
 */
export function logValidation(result: ValidationResult, projectId: string): void {
  const failed = result.checks.filter(c => !c.passed);
  if (failed.length === 0) {
    console.log(`[validator] Project ${projectId}: All ${result.checks.length} checks passed ✓`);
  } else {
    console.warn(`[validator] Project ${projectId}: ${failed.length}/${result.checks.length} checks failed:`);
    for (const f of failed) {
      console.warn(`  ⚠ ${f.name}: ${f.detail}`);
    }
  }
  // Log navigation issues separately for clarity
  if (result.navigationIssues && result.navigationIssues.length > 0) {
    console.warn(`[validator] Project ${projectId}: ${result.navigationIssues.length} navigation issue(s):`);
    for (const issue of result.navigationIssues) {
      const icon = issue.severity === 'error' ? '✗' : '⚠';
      console.warn(`  ${icon} [${issue.type}] ${issue.message}`);
    }
  }
}
