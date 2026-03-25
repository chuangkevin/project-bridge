import { GenerationPlan, planGeneration, PageAssignment } from './masterAgent';
import { generatePageFragment } from './subAgent';
import { assemblePrototype } from './htmlAssembler';
import { compileDesignTokens, DesignTokens } from './designTokenCompiler';
import { getGeminiApiKey, getGeminiApiKeyExcluding, getKeyCount } from './geminiKeys';
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

  // Step 1: Compile design tokens
  onProgress?.({ phase: 'tokens', message: '提取設計規範...' });
  let designTokens: DesignTokens | null = null;
  try {
    designTokens = await compileDesignTokens(projectId);
  } catch (err) {
    console.warn('[parallel] Token compilation failed, using defaults:', err);
  }

  // Step 2: Master agent plans
  onProgress?.({ phase: 'planning', message: '規劃頁面架構...' });
  const plan = await planGeneration(
    analysisData,
    designTokens,
    architectureBlock,
    designConvention,
    userMessage,
  );

  const totalPages = plan.pages.length;
  const pageNames = plan.pages.map(p => p.name);

  // Step 3: Generate pages in parallel, batched by available keys
  const keyCount = getKeyCount();
  const batchSize = Math.max(1, Math.min(keyCount, 4)); // Max 4 parallel
  const fragments: { name: string; html: string; success: boolean; error?: string }[] = [];

  for (let i = 0; i < plan.pages.length; i += batchSize) {
    const batch = plan.pages.slice(i, i + batchSize);

    // Assign a different key to each sub-agent in this batch
    const usedKeys: string[] = [];
    const batchPromises = batch.map((page, idx) => {
      let key: string | null;
      if (idx === 0 || usedKeys.length === 0) {
        key = getGeminiApiKey();
      } else {
        key = getGeminiApiKeyExcluding(usedKeys[usedKeys.length - 1]!);
      }
      if (!key) key = getGeminiApiKey(); // fallback
      if (key) usedKeys.push(key);

      const pageIdx = i + idx;
      onProgress?.({
        phase: 'generating',
        page: page.name,
        status: 'started',
        progress: `${pageIdx + 1}/${totalPages}`,
      });

      return generatePageFragment(
        key!,
        page,
        plan.cssVariables,
        plan.sharedCss,
        designConvention,
      ).then(result => {
        onProgress?.({
          phase: 'generating',
          page: page.name,
          status: result.success ? 'done' : 'error',
          progress: `${pageIdx + 1}/${totalPages}`,
          error: result.error,
        });

        // Retry once on failure with a different key
        if (!result.success && key) {
          const retryKey = getGeminiApiKeyExcluding(key);
          if (retryKey) {
            return generatePageFragment(retryKey, page, plan.cssVariables, plan.sharedCss, designConvention);
          }
        }
        return result;
      });
    });

    const batchResults = await Promise.all(batchPromises);
    fragments.push(...batchResults);
  }

  // Step 4: Assemble
  onProgress?.({ phase: 'assembling', message: '組裝原型...' });
  let html = assemblePrototype(plan, fragments);

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
