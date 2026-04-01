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
      ).then(async (origResult) => {
        let result = origResult;
        if (result.success) {
          // Pre-assembly gate: validate HTML structure immediately
          const gateResult = validateFragment(result.html, page.name);
          if (!gateResult.valid) {
            console.log(`[pre-gate] "${page.name}" FAILED: ${gateResult.reason}`);
            // Immediate retry with different key
            const gateRetryKey = getGeminiApiKeyExcluding(key);
            if (gateRetryKey) {
              const retryResult = await generatePageFragment(gateRetryKey, page, plan.cssVariables, plan.sharedCss, designConvention, pageSkills);
              if (retryResult.success) {
                const retryGate = validateFragment(retryResult.html, page.name);
                if (retryGate.valid) {
                  result = retryResult; // use retry result
                  console.log(`[pre-gate] "${page.name}" retry PASS: ${retryGate.textLen} chars`);
                }
              }
            }
          } else {
            console.log(`[pre-gate] "${page.name}" PASS: ${gateResult.textLen} chars, balance ${gateResult.divBalance}`);
          }
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

  // Step 2.5: QA — auto-retry thin/failed pages (one round)
  const retryTargets: number[] = [];
  for (let fi = 0; fi < fragments.length; fi++) {
    const frag = fragments[fi];
    if (!frag.success) {
      retryTargets.push(fi);
      continue;
    }
    // Strip nav/header to check real content (assembler will do this too)
    const stripped = frag.html
      .replace(/<nav[\s>][\s\S]{0,2000}?<\/nav>/gi, '')
      .replace(/<header[\s>][\s\S]{0,2000}?<\/header>/gi, '')
      .replace(/<footer[\s>][\s\S]{0,2000}?<\/footer>/gi, '');
    const textContent = stripped.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (textContent.length < 80) {
      retryTargets.push(fi);
    }
  }

  if (retryTargets.length > 0) {
    console.log(`[parallel-qa] Retrying ${retryTargets.length} thin/failed pages:`, retryTargets.map(i => fragments[i].name));
    // Wait 3s before retries — let 429 cooldown expire
    await new Promise(resolve => setTimeout(resolve, 3000));

    for (const fi of retryTargets) {
      const page = plan.pages[fi];
      if (!page) continue;
      const pageSkills = selectRelevantSkills(allSkills, page.name, page.spec);
      let retrySuccess = false;

      // Try up to 2 times with different keys
      for (let attempt = 0; attempt < 2 && !retrySuccess; attempt++) {
        const retryKey = getGeminiApiKeyExcluding('');
        if (!retryKey) break;
        onProgress?.({ phase: 'generating', page: page.name, status: 'started', message: `🔄 重新生成「${page.name}」(${attempt + 1}/2)...` });
        try {
          const retryResult = await generatePageFragment(retryKey, page, plan.cssVariables, plan.sharedCss, designConvention, pageSkills);
          if (retryResult.success) {
            const retryText = retryResult.html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
            if (retryText.length > (fragments[fi].success ? 80 : 0)) {
              fragments[fi] = retryResult;
              onProgress?.({ phase: 'generating', page: page.name, status: 'done', message: `✅ 重新生成「${page.name}」成功` });
              console.log(`[parallel-qa] Retry ${attempt + 1} success: "${page.name}" now ${retryText.length} chars`);
              retrySuccess = true;
            }
          } else {
            markKeyBad(retryKey);
            await new Promise(resolve => setTimeout(resolve, 2000)); // cooldown between attempts
          }
        } catch (e: any) {
          console.warn(`[parallel-qa] Retry ${attempt + 1} failed for "${page.name}":`, e.message?.slice(0, 50));
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
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

  // Store QA lessons for next generation
  if (qaReport.issues.filter(i => i.severity === 'critical').length > 0) {
    try {
      const { v4: uuidv4 } = require('uuid');
      for (const issue of qaReport.issues.filter(i => i.severity === 'critical').slice(0, 5)) {
        db.prepare('INSERT INTO project_lessons (id, project_id, lesson, source) VALUES (?, ?, ?, ?)').run(
          uuidv4(), projectId, `${issue.page}: ${issue.message}`, 'qa-report'
        );
      }
      console.log(`[lessons] Stored ${qaReport.issues.filter(i => i.severity === 'critical').length} lessons`);
    } catch (e: any) {
      console.warn('[lessons] Failed to store:', e.message?.slice(0, 50));
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

function validateFragment(html: string, pageName: string): { valid: boolean; reason?: string; textLen: number; divBalance: number } {
  // Strip nav/header/footer first (assembler will do this too)
  const stripped = html
    .replace(/<nav[\s>][\s\S]{0,2000}?<\/nav>/gi, '')
    .replace(/<header[\s>][\s\S]{0,2000}?<\/header>/gi, '')
    .replace(/<footer[\s>][\s\S]{0,2000}?<\/footer>/gi, '');

  const textContent = stripped.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const textLen = textContent.length;

  const openDivs = (stripped.match(/<div[\s>]/gi) || []).length;
  const closeDivs = (stripped.match(/<\/div>/gi) || []).length;
  const divBalance = openDivs - closeDivs;

  // Check 1: Has page wrapper
  if (!html.includes('class="page"') && !html.includes('data-page=')) {
    return { valid: false, reason: 'no page wrapper', textLen, divBalance };
  }

  // Check 2: Text content > 50 chars
  if (textLen < 50) {
    return { valid: false, reason: `text too short (${textLen} chars)`, textLen, divBalance };
  }

  // Check 3: Div balance within ±2
  if (Math.abs(divBalance) > 2) {
    return { valid: false, reason: `div imbalance (${openDivs} open, ${closeDivs} close)`, textLen, divBalance };
  }

  // Check 4: No full HTML document
  if (html.toLowerCase().includes('<!doctype') || html.toLowerCase().includes('<html')) {
    return { valid: false, reason: 'contains full HTML document', textLen, divBalance };
  }

  return { valid: true, textLen, divBalance };
}

export function getLessons(projectId: string): string[] {
  try {
    // Clean up expired lessons (>30 days)
    db.prepare("DELETE FROM project_lessons WHERE created_at < datetime('now', '-30 days')").run();
    // Get recent lessons
    const rows = db.prepare('SELECT lesson FROM project_lessons WHERE project_id = ? ORDER BY created_at DESC LIMIT 10').all(projectId) as { lesson: string }[];
    return rows.map(r => r.lesson);
  } catch {
    return [];
  }
}
