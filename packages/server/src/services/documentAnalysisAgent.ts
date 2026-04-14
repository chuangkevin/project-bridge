import fs from 'fs';
import { StepRunner } from '@kevinsisi/ai-core';
import db from '../db/connection';
import { createProjectBridgeStepRunner, withGeminiRetry } from './geminiRetry';
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
import { reviewSpecDocuments, SpecReviewResult } from './specReviewAgent';

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
  review?: SpecReviewResult;
  // Skills output — enriched understanding
  explore?: ExploreResult;
  uxReview?: UxReviewResult;
  designProposal?: DesignProposalResult;
  businessContext?: BusinessContextResult;
}

/** Convenience: wraps a Gemini call with auto key-rotation and retry. */
async function withRetry<T>(fn: (apiKey: string) => Promise<T>): Promise<T> {
  return withGeminiRetry(fn, { callType: 'document-analysis', maxRetries: 2 });
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

      const stepRunner = createProjectBridgeStepRunner(2);
      const skillDelayMs = 1500;

      try {
        const exploreStep = await stepRunner.runStep({
          id: 'skill-explore',
          name: 'skill-explore',
          allowSharedFallback: true,
          run: async (apiKey: string) => skillExplore(extractedText, apiKey),
        });
        result.explore = exploreStep.value;
        const explore = result.explore;
        console.log(`[agent] Explore: domain="${explore.domain}", ${explore.edgeCases.length} edge cases`);
      } catch (e: any) {
        console.warn(`[agent] Explore skill failed:`, e.message);
      }

      await new Promise(r => setTimeout(r, skillDelayMs));

      try {
        const uxReviewStep = await stepRunner.runStep({
          id: 'skill-ux-review',
          name: 'skill-ux-review',
          allowSharedFallback: true,
          run: async (apiKey: string) => skillUxReview(extractedText, result.pages, apiKey),
        });
        result.uxReview = uxReviewStep.value;
        const uxReview = result.uxReview;
        console.log(`[agent] UX Review: score=${uxReview.overallScore}/10, ${uxReview.issues.length} issues`);
      } catch (e: any) {
        console.warn(`[agent] UX Review skill failed:`, e.message);
      }

      await new Promise(r => setTimeout(r, skillDelayMs));

      try {
        const designProposalStep = await stepRunner.runStep({
          id: 'skill-design-proposal',
          name: 'skill-design-proposal',
          allowSharedFallback: true,
          run: async (apiKey: string) => skillDesignProposal(extractedText, result.pages, result.explore || null, apiKey),
        });
        result.designProposal = designProposalStep.value;
        const designProposal = result.designProposal;
        console.log(`[agent] Design Proposal: "${(designProposal.designDirection || '').slice(0, 80)}..."`);
      } catch (e: any) {
        console.warn(`[agent] Design Proposal skill failed:`, e.message);
      }

      await new Promise(r => setTimeout(r, skillDelayMs));

      try {
        const businessContextStep = await stepRunner.runStep({
          id: 'skill-business-context',
          name: 'skill-business-context',
          allowSharedFallback: true,
          run: async (apiKey: string) => skillBusinessContext(extractedText, result.pages, apiKey),
        });
        result.businessContext = businessContextStep.value;
        const businessContext = result.businessContext;
        console.log(`[agent] Business Context: ${businessContext.matchedSkills.length} skills matched, ${businessContext.businessRules.length} rules, ${businessContext.internalTerms.length} terms`);
      } catch (e: any) {
        console.warn(`[agent] Business Context skill failed:`, e.message);
      }

      try {
        const originalNameRow = db.prepare('SELECT original_name FROM uploaded_files WHERE id = ?').get(fileId) as { original_name?: string } | undefined;
        result.review = await reviewSpecDocuments([
          {
            fileName: originalNameRow?.original_name || storagePath.split(/[/\\]/).pop() || 'uploaded-document',
            extractedText,
            analysisResult: {
              documentType: result.documentType,
              pages: result.pages,
              globalRules: result.globalRules,
              summary: result.summary,
            },
          },
        ], []) || undefined;
      } catch (e: any) {
        console.warn('[agent] Spec review failed:', e.message);
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
