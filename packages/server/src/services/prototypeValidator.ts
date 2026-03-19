/**
 * Prototype Quality Validator — checks generated HTML against analysis results.
 *
 * Non-blocking: logs warnings but never prevents prototype storage.
 * Used for quality monitoring and debugging.
 */

export interface ValidationResult {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    detail: string;
  }>;
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

  const passed = checks.every(c => c.passed);
  return { passed, checks };
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
}
