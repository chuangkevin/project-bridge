import { GenerationPlan, buildLocalPlan, PageAssignment } from './masterAgent';
import { AGENTS } from './plannerAgent';
import { generatePageFragment, SkillForSubAgent } from './subAgent';
import { assemblePrototype, fixNavigation } from './htmlAssembler';
import { compileDesignTokens, DesignTokens } from './designTokenCompiler';
import { assignBatchKeys, getGeminiApiKeyExcluding, markKeyBad } from './geminiKeys';
import { sanitizeGeneratedHtml, injectConventionColors } from './htmlSanitizer';
import { autoFixDesignViolations } from './designSystemValidator';
import { validatePrototypeHtml, formatQaReport } from './htmlQaValidator';
import { getActiveSkills } from '../routes/skills';
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
  // buildLocalPlan now extracts design tokens from designConvention automatically
  onProgress?.({ phase: 'planning', message: '規劃頁面架構...' });
  const pageNamesFromAnalysis: string[] = analysisData?.pages?.map((p: any) => p.name || p) || [];
  if (pageNamesFromAnalysis.length < 2) throw new Error('No pages to generate');
  const plan = buildLocalPlan(pageNamesFromAnalysis, userMessage, designConvention);

  console.log('[parallel] Local plan ready:', plan.pages.length, 'pages, sharedCss:', plan.sharedCss.length, 'chars');

  // Load active skills for sub-agent injection
  const allSkills = getActiveSkills(projectId).map(s => ({
    name: s.name, content: s.content,
  }));
  console.log('[parallel] Skills for sub-agents:', allSkills.length);

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

      // Select top 3 relevant skills for this page
      const pageSkills = selectRelevantSkills(allSkills, page.name, page.spec);

      return generatePageFragment(
        key,
        page,
        plan.cssVariables,
        plan.sharedCss,
        designConvention,
        pageSkills,
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
          const retryResult = await generatePageFragment(retryKey, page, plan.cssVariables, plan.sharedCss, designConvention, pageSkills);
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

  // Step 2.5: QA — nav/header/footer stripping is now done in assembler
  // (assembler strips ALL nav/header/footer aggressively, not just specific classes)

  // Step 2.6: QA — check content quality, log thin pages
  for (const frag of fragments) {
    if (frag.success) {
      const textContent = frag.html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      if (textContent.length < 100) {
        console.warn(`[parallel-qa] Page "${frag.name}" is thin: only ${textContent.length} chars of text`);
        onProgress?.({ phase: 'generating', page: frag.name, status: 'error', message: `⚠️ ${frag.name} 內容不足，可能需要微調` });
      }
    }
  }

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

  // Step 6: QA validation
  const qaReport = validatePrototypeHtml(html);
  console.log(formatQaReport(qaReport));
  if (!qaReport.passed) {
    console.warn('[parallel] QA FAILED — critical issues found in generated prototype');
    // Log critical issues to progress stream so user sees them
    for (const issue of qaReport.issues.filter(i => i.severity === 'critical')) {
      onProgress?.({ phase: 'assembling', message: `⚠️ QA: ${issue.message}` });
    }
  }

  onProgress?.({ phase: 'done' });

  return {
    html,
    pages: pageNames,
    isMultiPage: pageNames.length > 1,
  };
}

/**
 * Select top 3 most relevant skills for a page based on keyword overlap.
 * Each skill content is truncated to 500 chars.
 */
function selectRelevantSkills(
  allSkills: { name: string; content: string }[],
  pageName: string,
  pageSpec: string,
): SkillForSubAgent[] {
  if (allSkills.length === 0) return [];

  const pageText = (pageName + ' ' + pageSpec).toLowerCase();
  const scored = allSkills.map(skill => {
    const keywords = (skill.name + ' ' + skill.content.slice(0, 200)).toLowerCase().split(/\s+/);
    let score = 0;
    for (const kw of keywords) {
      if (kw.length >= 2 && pageText.includes(kw)) score++;
    }
    return { skill, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, 3).map(s => ({
    name: s.skill.name,
    content: s.skill.content.slice(0, 500) + (s.skill.content.length > 500 ? '...' : ''),
  }));
}
