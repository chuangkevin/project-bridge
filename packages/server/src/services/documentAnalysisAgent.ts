import fs from 'fs';
import db from '../db/connection';
import { getGeminiApiKey, getGeminiApiKeyExcluding } from './geminiKeys';
import { classifyDocument, DocumentType } from './documentClassifier';
import { extractSpecData, SpecPage } from './specExtractor';
import { extractDesignData, DesignGlobalStyles } from './designExtractor';
import { renderPdfPages } from './pdfPageRenderer';
import {
  skillExplore, ExploreResult,
  skillUxReview, UxReviewResult,
  skillDesignProposal, DesignProposalResult,
  skillBusinessContext, BusinessContextResult,
} from './agentSkills';

export interface AnalysisPage {
  name: string;
  viewport: 'desktop' | 'mobile' | 'both';
  components: string[];
  interactions: string[];
  dataFields: string[];
  businessRules: string[];
  navigationTo: string[];
  layout?: string;
}

export interface DocumentAnalysisResult {
  documentType: DocumentType;
  pages: AnalysisPage[];
  globalStyles?: DesignGlobalStyles;
  globalRules: string[];
  summary: string;
  // Skills output — enriched understanding
  explore?: ExploreResult;
  uxReview?: UxReviewResult;
  designProposal?: DesignProposalResult;
  businessContext?: BusinessContextResult;
}

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

/**
 * Retry wrapper for Gemini API calls — handles 429 rate limits with key rotation.
 */
async function withRetry<T>(fn: (apiKey: string) => Promise<T>): Promise<T> {
  let lastKey = getGeminiApiKey();
  if (!lastKey) throw new Error('No Gemini API key available');

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn(lastKey);
    } catch (err: any) {
      const is429 = err?.status === 429 || err?.message?.includes('429');
      if (!is429 || attempt === MAX_RETRIES) throw err;

      console.warn(`[agent] 429 on key ...${lastKey.slice(-4)}, retrying with different key in ${RETRY_DELAY_MS}ms`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));

      const nextKey = getGeminiApiKeyExcluding(lastKey);
      if (nextKey) lastKey = nextKey;
      // If no other key available, retry with same key after delay
    }
  }
  throw new Error('Unreachable');
}

/**
 * Main document analysis agent — orchestrates classification, extraction, and quality check.
 * Called as fire-and-forget from upload routes.
 */
export async function analyzeDocument(
  fileId: string,
  storagePath: string,
  mimeType: string,
  extractedText: string
): Promise<DocumentAnalysisResult> {
  // Step 0: Mark as running
  db.prepare("UPDATE uploaded_files SET analysis_status = 'running' WHERE id = ?").run(fileId);

  try {
    // Step 0.5: Prepare images
    const isPdf = mimeType.includes('pdf') || storagePath.toLowerCase().endsWith('.pdf');
    const isImage = mimeType.startsWith('image/');
    let images: Buffer[] = [];

    if (isPdf) {
      images = await renderPdfPages(storagePath, 6);
    } else if (isImage && fs.existsSync(storagePath)) {
      images = [fs.readFileSync(storagePath)];
    }

    if (images.length === 0 && !extractedText) {
      throw new Error('No images or text to analyze');
    }

    // Step 1: Classify document type
    console.log(`[agent] Step 1: Classifying document ${fileId}...`);
    const classification = await withRetry(key =>
      classifyDocument(images, extractedText, key)
    );
    console.log(`[agent] Classified as: ${classification.documentType} (${classification.confidence})`);

    let result: DocumentAnalysisResult;

    // Step 2: Branch based on document type
    switch (classification.documentType) {
      case 'spec': {
        console.log(`[agent] Step 2: Extracting spec data...`);
        const spec = await withRetry(key =>
          extractSpecData(extractedText, images, key)
        );
        result = {
          documentType: 'spec',
          pages: spec.pages.map(p => ({ ...p, layout: undefined })),
          globalRules: spec.globalRules,
          summary: spec.summary,
        };
        break;
      }

      case 'design':
      case 'screenshot': {
        console.log(`[agent] Step 2: Extracting design data...`);
        const design = await withRetry(key =>
          extractDesignData(images, key)
        );
        result = {
          documentType: classification.documentType,
          pages: design.pages.map(p => ({
            name: p.name,
            viewport: p.viewport,
            components: p.components,
            interactions: [],
            dataFields: [],
            businessRules: [],
            navigationTo: [],
            layout: p.layout,
          })),
          globalStyles: design.globalStyles,
          globalRules: [],
          summary: `${classification.documentType === 'screenshot' ? 'Screenshot' : 'Design mockup'} with ${design.pages.length} page(s)`,
        };
        // Also write rawAnalysis to visual_analysis for backward compatibility
        if (design.rawAnalysis) {
          db.prepare('UPDATE uploaded_files SET visual_analysis = ? WHERE id = ?')
            .run(design.rawAnalysis, fileId);
        }
        break;
      }

      case 'mixed': {
        console.log(`[agent] Step 2: Extracting mixed (spec + design) data...`);
        // Run both extractors
        const [spec, design] = await Promise.all([
          withRetry(key => extractSpecData(extractedText, images, key)),
          withRetry(key => extractDesignData(images, key)),
        ]);

        // Merge: spec pages get design layout info
        const mergedPages: AnalysisPage[] = spec.pages.map(sp => {
          const matchingDesign = design.pages.find(dp =>
            dp.name === sp.name ||
            dp.name.includes(sp.name) ||
            sp.name.includes(dp.name)
          );
          return {
            ...sp,
            layout: matchingDesign?.layout,
            components: [...new Set([...sp.components, ...(matchingDesign?.components || [])])],
          };
        });

        // Add design pages not matched to any spec page
        for (const dp of design.pages) {
          const alreadyMerged = mergedPages.some(mp =>
            mp.name === dp.name || mp.name.includes(dp.name) || dp.name.includes(mp.name)
          );
          if (!alreadyMerged) {
            mergedPages.push({
              name: dp.name,
              viewport: dp.viewport,
              components: dp.components,
              interactions: [],
              dataFields: [],
              businessRules: [],
              navigationTo: [],
              layout: dp.layout,
            });
          }
        }

        result = {
          documentType: 'mixed',
          pages: mergedPages,
          globalStyles: design.globalStyles,
          globalRules: spec.globalRules,
          summary: spec.summary,
        };

        if (design.rawAnalysis) {
          db.prepare('UPDATE uploaded_files SET visual_analysis = ? WHERE id = ?')
            .run(design.rawAnalysis, fileId);
        }
        break;
      }

      default:
        throw new Error(`Unknown document type: ${classification.documentType}`);
    }

    // Step 3: Quality check — verify we extracted reasonable content
    const emptyPages = result.pages.filter(p =>
      p.components.length === 0 && p.interactions.length === 0 && p.dataFields.length === 0
    );
    if (emptyPages.length > 0 && result.documentType === 'spec') {
      console.warn(`[agent] Quality check: ${emptyPages.length}/${result.pages.length} pages have no extracted content`);
    }

    // Step 4: Agent Skills — deep understanding layer (for spec & mixed types)
    if (extractedText.length > 100 && (result.documentType === 'spec' || result.documentType === 'mixed')) {
      console.log(`[agent] Step 4: Running skills (explore → uxReview → designProposal)...`);

      // Run skills sequentially with delays to avoid rate limits
      // Each skill uses withRetry which rotates keys on 429

      // Skill 1: Explore — understand domain, users, flow
      try {
        result.explore = await withRetry(key => skillExplore(extractedText, key));
        console.log(`[agent] Explore: domain="${result.explore.domain}", ${result.explore.edgeCases.length} edge cases`);
      } catch (e: any) {
        console.warn(`[agent] Explore skill failed:`, e.message);
      }

      await new Promise(r => setTimeout(r, 1500)); // Rate limit buffer

      // Skill 2: UX Review — evaluate quality
      try {
        result.uxReview = await withRetry(key => skillUxReview(extractedText, result.pages, key));
        console.log(`[agent] UX Review: score=${result.uxReview.overallScore}/10, ${result.uxReview.issues.length} issues`);
      } catch (e: any) {
        console.warn(`[agent] UX Review skill failed:`, e.message);
      }

      await new Promise(r => setTimeout(r, 1500)); // Rate limit buffer

      // Skill 3: Design Proposal — generate design direction (uses explore output)
      try {
        result.designProposal = await withRetry(key =>
          skillDesignProposal(extractedText, result.pages, result.explore || null, key)
        );
        console.log(`[agent] Design Proposal: "${(result.designProposal.designDirection || '').slice(0, 80)}..."`);
      } catch (e: any) {
        console.warn(`[agent] Design Proposal skill failed:`, e.message);
      }

      await new Promise(r => setTimeout(r, 1500)); // Rate limit buffer

      // Skill 4: Business Context — internal domain knowledge from company skills
      try {
        result.businessContext = await withRetry(key =>
          skillBusinessContext(extractedText, result.pages, key)
        );
        console.log(`[agent] Business Context: ${result.businessContext.matchedSkills.length} skills matched, ${result.businessContext.businessRules.length} rules, ${result.businessContext.internalTerms.length} terms`);
      } catch (e: any) {
        console.warn(`[agent] Business Context skill failed:`, e.message);
      }
    }

    // Step 5: Write result to DB
    db.prepare(
      "UPDATE uploaded_files SET analysis_result = ?, analysis_status = 'done' WHERE id = ?"
    ).run(JSON.stringify(result), fileId);

    console.log(`[agent] Analysis complete for ${fileId}: ${result.documentType}, ${result.pages.length} pages`);
    return result;

  } catch (err: any) {
    console.error(`[agent] Analysis failed for ${fileId}:`, err.message);
    db.prepare(
      "UPDATE uploaded_files SET analysis_status = 'failed' WHERE id = ?"
    ).run(fileId);
    throw err;
  }
}
