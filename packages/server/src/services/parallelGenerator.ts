import { GenerationPlan, buildLocalPlan, PageAssignment } from './masterAgent';
import { AGENTS } from './plannerAgent';
import { generatePageFragment } from './subAgent';
import { assemblePrototype, fixNavigation } from './htmlAssembler';
import { compileDesignTokens, DesignTokens } from './designTokenCompiler';
import { assignBatchKeys, getGeminiApiKeyExcluding, markKeyBad } from './geminiKeys';
import { sanitizeGeneratedHtml, injectConventionColors } from './htmlSanitizer';
import { autoFixDesignViolations } from './designSystemValidator';
import db from '../db/connection';

export interface GenerationProgress {
  phase: 'planning' | 'tokens' | 'generating' | 'assembling' | 'done' | 'error';
  message?: string;
  page?: string;
  status?: 'started' | 'done' | 'error';
  progress?: string; // e.g., "2/5"
  error?: string;
}

type ProgressCallback = (event: GenerationProgress) => void;

/**
 * Run the full parallel generation pipeline:
 * 1. Compile design tokens
 * 2. Master agent plans page assignments
 * 3. Sub-agents generate pages in parallel (batched by available keys)
 * 4. Assembler merges fragments
 * 5. Post-process (sanitize, inject convention colors)
 */
export async function generateParallel(
  projectId: string,
  analysisData: any,
  architectureBlock: string,
  designConvention: string,
  userMessage: string,
  onProgress?: ProgressCallback,
): Promise<{ html: string; pages: string[]; isMultiPage: boolean }> {

  // Step 1: Build local plan — NO API call, instant
  onProgress?.({ phase: 'planning', message: '規劃頁面架構...' });
  const pageNamesFromAnalysis: string[] = analysisData?.pages?.map((p: any) => p.name || p) || [];
  if (pageNamesFromAnalysis.length < 2) throw new Error('No pages to generate');
  const plan = buildLocalPlan(pageNamesFromAnalysis, userMessage, designConvention);
  console.log('[parallel] Local plan ready:', plan.pages.length, 'pages, sharedCss:', plan.sharedCss.length, 'chars');

  const totalPages = plan.pages.length;
  const pageNames = plan.pages.map(p => p.name);

  // Step 2: Assign unique keys — each sub-agent gets its own
  const batchKeys = assignBatchKeys(totalPages);
  const batchSize = Math.min(totalPages, batchKeys.length, 5); // Max 5 parallel
  console.log('[parallel] Assigned', batchKeys.length, 'keys for', totalPages, 'pages');
  const fragments: { name: string; html: string; success: boolean; error?: string }[] = [];

  for (let i = 0; i < plan.pages.length; i += batchSize) {
    const batch = plan.pages.slice(i, i + batchSize);

    // Assign a different key to each sub-agent in this batch

    const batchPromises = batch.map((page, idx) => {
      const pageIdx = i + idx;
      const key = batchKeys[pageIdx] || batchKeys[0];

      const devName = AGENTS.devs[pageIdx % AGENTS.devs.length];
      onProgress?.({
        phase: 'generating',
        page: page.name,
        status: 'started',
        progress: `${pageIdx + 1}/${totalPages}`,
        message: `${devName} 正在製作「${page.name}」...`,
      });

      return generatePageFragment(
        key,
        page,
        plan.cssVariables,
        plan.sharedCss,
        designConvention,
      ).then(async (result) => {
        if (result.success) {
          onProgress?.({ phase: 'generating', page: page.name, status: 'done', progress: `${pageIdx + 1}/${totalPages}`, message: `${devName} 完成了「${page.name}」✓` });
          return result;
        }
        // Retry up to 2 times with different keys
        markKeyBad(key);
        for (let retry = 0; retry < 2; retry++) {
          const retryKey = getGeminiApiKeyExcluding(key);
          if (!retryKey) break;
          onProgress?.({ phase: 'generating', page: page.name, status: 'started', progress: `${pageIdx + 1}/${totalPages}`, message: `重試 ${retry + 1}` });
          const retryResult = await generatePageFragment(retryKey, page, plan.cssVariables, plan.sharedCss, designConvention);
          if (retryResult.success) {
            onProgress?.({ phase: 'generating', page: page.name, status: 'done', progress: `${pageIdx + 1}/${totalPages}` });
            return retryResult;
          }
          markKeyBad(retryKey);
        }
        onProgress?.({ phase: 'generating', page: page.name, status: 'error', progress: `${pageIdx + 1}/${totalPages}`, error: result.error });
        return result;
      });
    });

    const batchResults = await Promise.all(batchPromises);
    fragments.push(...batchResults);
  }

  // Check failure rate
  const failedCount = fragments.filter(f => !f.success).length;
  if (failedCount > totalPages / 2) {
    throw new Error(`多數頁面生成失敗 (${failedCount}/${totalPages})，請稍後重試`);
  }
  console.log('[parallel] Results:', fragments.filter(f => f.success).length, 'ok,', failedCount, 'failed');

  // Step 3: Assemble
  onProgress?.({ phase: 'assembling', message: '組裝原型...' });
  let html = assemblePrototype(plan, fragments);

  // Step 3.5: Fix navigation links (broken targets, page- prefix, etc.)
  const navFix = fixNavigation(html);
  html = navFix.html;
  if (navFix.fixes.length > 0) {
    console.log('[parallel] Navigation fixes:', navFix.fixes.length, navFix.fixes.slice(0, 5));
  }

  // Step 5: Post-process
  html = sanitizeGeneratedHtml(html, true);
  {
    const { html: autoFixedHtml, fixes } = autoFixDesignViolations(html);
    html = autoFixedHtml;
    if (fixes.length > 0) console.log('[design-validator] Auto-fixes applied:', fixes);
  }
  if (designConvention) {
    html = injectConventionColors(html, designConvention);
  }

  onProgress?.({ phase: 'done' });

  return {
    html,
    pages: pageNames,
    isMultiPage: pageNames.length > 1,
  };
}
