import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiModel, trackUsage } from './geminiKeys';
import { withGeminiRetry } from './geminiRetry';

export interface ReviewSkillInput {
  name: string;
  description: string;
  content: string;
}

export interface ReviewDocumentInput {
  fileName: string;
  extractedText: string;
  intent?: string | null;
  analysisResult?: unknown;
}

export interface ReviewSourceDocument {
  fileName: string;
  role: 'source_of_truth' | 'derived_summary' | 'reference' | 'unknown';
  reason: string;
}

export interface ReviewedApiContract {
  method: string;
  path: string;
  purpose: string;
  requestFields: string[];
  responseFields: string[];
  errorCodes: string[];
  sourceFiles: string[];
}

export interface ReviewedBusinessRule {
  rule: string;
  sourceFiles: string[];
}

export interface ReviewDifference {
  type: 'missing' | 'conflict' | 'unsupported_assumption' | 'coverage_gap';
  severity: 'critical' | 'major' | 'minor';
  topic: string;
  details: string;
  sourceFiles: string[];
}

export interface ReviewVerification {
  consistencyScore: number;
  supportedClaims: string[];
  uncertainClaims: string[];
  recommendedChecks: string[];
}

export interface SpecReviewResult {
  overallAssessment: string;
  sourceDocuments: ReviewSourceDocument[];
  apiContracts: ReviewedApiContract[];
  businessRules: ReviewedBusinessRule[];
  openQuestions: string[];
  differences: ReviewDifference[];
  verification: ReviewVerification;
}

const SPEC_REVIEW_PROMPT = `You are a senior specification reviewer.

Your job is NOT to invent architecture. Your first priority is faithful extraction from the original uploaded documents.

Review goals:
1. Preserve contract-level details exactly when present: HTTP method, path, request fields, response fields, error codes, enum values, nullable rules, scope limits.
2. If multiple documents are provided, identify which ones are likely the source of truth vs derived AI summaries.
3. Diff the documents and surface any missing requirements, conflicts, or unsupported assumptions.
4. Use the supplied domain skills only to clarify terminology and implementation context. Skills must NEVER override an explicit requirement in the source documents.
5. Self-check your own conclusions. If something is inferred instead of directly stated, mark it as uncertain.

Return JSON only:
{
  "overallAssessment": "1-3 sentence summary of document quality and what can be trusted",
  "sourceDocuments": [
    {
      "fileName": "name",
      "role": "source_of_truth|derived_summary|reference|unknown",
      "reason": "why this role was assigned"
    }
  ],
  "apiContracts": [
    {
      "method": "GET",
      "path": "/api/v1/example",
      "purpose": "what this API does",
      "requestFields": ["fieldName:type:required/optional"],
      "responseFields": ["fieldName:type"],
      "errorCodes": ["ERROR_CODE or HTTP status behavior"],
      "sourceFiles": ["file names backing this contract"]
    }
  ],
  "businessRules": [
    {
      "rule": "explicit business rule or constraint",
      "sourceFiles": ["file names"]
    }
  ],
  "openQuestions": ["things still not confirmed by the source docs"],
  "differences": [
    {
      "type": "missing|conflict|unsupported_assumption|coverage_gap",
      "severity": "critical|major|minor",
      "topic": "short topic",
      "details": "what differs and why it matters",
      "sourceFiles": ["file names involved"]
    }
  ],
  "verification": {
    "consistencyScore": 0,
    "supportedClaims": ["facts directly supported by explicit text"],
    "uncertainClaims": ["claims that are inferred or need confirmation"],
    "recommendedChecks": ["specific next checks to validate correctness"]
  }
}

Important rules:
- Prefer the most explicit requirements document when conflicts exist.
- A generated summary or AI-written planning memo is lower priority than a raw requirement/spec document.
- Do not collapse multiple APIs into one bullet if the source documents separate them.
- Keep concrete names from the documents.
- If there are no APIs, still return business rules and document differences.
- If a document adds architecture decisions not grounded in the source of truth, flag them as unsupported_assumption.`;

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function normalizeReviewResult(raw: any): SpecReviewResult {
  return {
    overallAssessment: typeof raw?.overallAssessment === 'string' ? raw.overallAssessment : '',
    sourceDocuments: Array.isArray(raw?.sourceDocuments) ? raw.sourceDocuments.map((doc: any) => ({
      fileName: typeof doc?.fileName === 'string' ? doc.fileName : 'Unknown',
      role: doc?.role === 'source_of_truth' || doc?.role === 'derived_summary' || doc?.role === 'reference' ? doc.role : 'unknown',
      reason: typeof doc?.reason === 'string' ? doc.reason : '',
    })) : [],
    apiContracts: Array.isArray(raw?.apiContracts) ? raw.apiContracts.map((api: any) => ({
      method: typeof api?.method === 'string' ? api.method : '',
      path: typeof api?.path === 'string' ? api.path : '',
      purpose: typeof api?.purpose === 'string' ? api.purpose : '',
      requestFields: Array.isArray(api?.requestFields) ? api.requestFields.filter((x: unknown) => typeof x === 'string') : [],
      responseFields: Array.isArray(api?.responseFields) ? api.responseFields.filter((x: unknown) => typeof x === 'string') : [],
      errorCodes: Array.isArray(api?.errorCodes) ? api.errorCodes.filter((x: unknown) => typeof x === 'string') : [],
      sourceFiles: Array.isArray(api?.sourceFiles) ? api.sourceFiles.filter((x: unknown) => typeof x === 'string') : [],
    })) : [],
    businessRules: Array.isArray(raw?.businessRules) ? raw.businessRules.map((rule: any) => ({
      rule: typeof rule?.rule === 'string' ? rule.rule : '',
      sourceFiles: Array.isArray(rule?.sourceFiles) ? rule.sourceFiles.filter((x: unknown) => typeof x === 'string') : [],
    })) : [],
    openQuestions: Array.isArray(raw?.openQuestions) ? raw.openQuestions.filter((x: unknown) => typeof x === 'string') : [],
    differences: Array.isArray(raw?.differences) ? raw.differences.map((diff: any) => ({
      type: diff?.type === 'missing' || diff?.type === 'conflict' || diff?.type === 'unsupported_assumption' ? diff.type : 'coverage_gap',
      severity: diff?.severity === 'critical' || diff?.severity === 'major' ? diff.severity : 'minor',
      topic: typeof diff?.topic === 'string' ? diff.topic : '',
      details: typeof diff?.details === 'string' ? diff.details : '',
      sourceFiles: Array.isArray(diff?.sourceFiles) ? diff.sourceFiles.filter((x: unknown) => typeof x === 'string') : [],
    })) : [],
    verification: {
      consistencyScore: typeof raw?.verification?.consistencyScore === 'number' ? raw.verification.consistencyScore : 0,
      supportedClaims: Array.isArray(raw?.verification?.supportedClaims) ? raw.verification.supportedClaims.filter((x: unknown) => typeof x === 'string') : [],
      uncertainClaims: Array.isArray(raw?.verification?.uncertainClaims) ? raw.verification.uncertainClaims.filter((x: unknown) => typeof x === 'string') : [],
      recommendedChecks: Array.isArray(raw?.verification?.recommendedChecks) ? raw.verification.recommendedChecks.filter((x: unknown) => typeof x === 'string') : [],
    },
  };
}

function buildDocumentBlock(documents: ReviewDocumentInput[]): string {
  return documents.map((doc, index) => {
    const analysisText = doc.analysisResult ? JSON.stringify(doc.analysisResult).slice(0, 4000) : '';
    const intentLine = doc.intent ? `Intent: ${doc.intent}\n` : '';
    return [
      `=== DOCUMENT ${index + 1}: ${doc.fileName} ===`,
      intentLine + `Text:\n${doc.extractedText.slice(0, 50000)}`,
      analysisText ? `Prior structured analysis (lower priority than raw text):\n${analysisText}` : '',
      '=== END DOCUMENT ===',
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}

function buildSkillBlock(skills: ReviewSkillInput[]): string {
  if (skills.length === 0) return 'No domain skills provided.';

  return skills.slice(0, 6).map(skill => [
    `=== SKILL: ${skill.name} ===`,
    `Description: ${skill.description}`,
    skill.content.slice(0, 4000),
    '=== END SKILL ===',
  ].join('\n')).join('\n\n');
}

export async function reviewSpecDocuments(
  documents: ReviewDocumentInput[],
  skills: ReviewSkillInput[]
): Promise<SpecReviewResult | null> {
  const usableDocs = documents.filter(doc => doc.extractedText.trim().length > 50);
  if (usableDocs.length === 0) return null;

  return withGeminiRetry(async apiKey => {
    const genai = new GoogleGenerativeAI(apiKey);
    const model = genai.getGenerativeModel({
      model: getGeminiModel(),
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0,
        responseMimeType: 'application/json',
      },
    });

    const prompt = [
      SPEC_REVIEW_PROMPT,
      '=== DOCUMENTS ===',
      buildDocumentBlock(usableDocs),
      '=== DOMAIN SKILLS ===',
      buildSkillBlock(skills),
      '=== END ===',
    ].join('\n\n');

    const result = await model.generateContent(prompt);
    try { trackUsage(apiKey, getGeminiModel(), 'spec-review', result.response.usageMetadata); } catch {}

    const parsed = safeJsonParse<any>(result.response.text());
    return parsed ? normalizeReviewResult(parsed) : null;
  }, { callType: 'spec-review', maxRetries: 2 });
}

export function formatSpecReviewForPrompt(review: SpecReviewResult): string {
  let block = '=== HIGH-FIDELITY DOCUMENT REVIEW ===\n';
  if (review.overallAssessment) {
    block += `Assessment: ${review.overallAssessment}\n`;
  }

  if (review.sourceDocuments.length > 0) {
    block += '\nSource of truth ranking:\n';
    for (const doc of review.sourceDocuments) {
      block += `- ${doc.fileName}: ${doc.role} — ${doc.reason}\n`;
    }
  }

  if (review.apiContracts.length > 0) {
    block += '\nAPI contracts confirmed from source docs:\n';
    for (const api of review.apiContracts) {
      block += `- ${api.method} ${api.path}: ${api.purpose}\n`;
      if (api.requestFields.length > 0) block += `  request: ${api.requestFields.join('; ')}\n`;
      if (api.responseFields.length > 0) block += `  response: ${api.responseFields.join('; ')}\n`;
      if (api.errorCodes.length > 0) block += `  errors: ${api.errorCodes.join('; ')}\n`;
      if (api.sourceFiles.length > 0) block += `  sources: ${api.sourceFiles.join(', ')}\n`;
    }
  }

  if (review.businessRules.length > 0) {
    block += '\nExplicit business rules:\n';
    for (const rule of review.businessRules.slice(0, 20)) {
      block += `- ${rule.rule}`;
      if (rule.sourceFiles.length > 0) block += ` [${rule.sourceFiles.join(', ')}]`;
      block += '\n';
    }
  }

  if (review.differences.length > 0) {
    block += '\nCross-document differences to reconcile:\n';
    for (const diff of review.differences) {
      block += `- [${diff.severity}] ${diff.type} ${diff.topic}: ${diff.details}`;
      if (diff.sourceFiles.length > 0) block += ` [${diff.sourceFiles.join(', ')}]`;
      block += '\n';
    }
  }

  if (review.openQuestions.length > 0) {
    block += '\nStill unconfirmed:\n';
    for (const question of review.openQuestions) {
      block += `- ${question}\n`;
    }
  }

  if (review.verification.supportedClaims.length > 0 || review.verification.uncertainClaims.length > 0) {
    block += `\nVerification score: ${review.verification.consistencyScore}/100\n`;
    if (review.verification.supportedClaims.length > 0) {
      block += 'Supported claims:\n';
      for (const claim of review.verification.supportedClaims.slice(0, 12)) {
        block += `- ${claim}\n`;
      }
    }
    if (review.verification.uncertainClaims.length > 0) {
      block += 'Uncertain or inferred claims:\n';
      for (const claim of review.verification.uncertainClaims.slice(0, 12)) {
        block += `- ${claim}\n`;
      }
    }
  }

  block += '=== END HIGH-FIDELITY DOCUMENT REVIEW ===';
  return block;
}
