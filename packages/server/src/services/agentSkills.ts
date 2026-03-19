/**
 * Agent Skills — specialized thinking steps inspired by OpenSpec & Superpowers.
 *
 * Each skill is a focused Gemini call that adds a layer of understanding
 * beyond raw data extraction. Skills are modular — the orchestrator picks
 * which ones to run based on document type.
 *
 * Skill pattern from OpenSpec:
 *   explore  → deeply understand before acting
 *   propose  → structured design proposals
 *   review   → evaluate quality against best practices
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiModel, trackUsage } from './geminiKeys';

// ─────────────────────────────────────────────
// Skill 1: EXPLORE — Deep understanding
// Inspired by openspec-explore: curious, visual, adaptive
// ─────────────────────────────────────────────

export interface ExploreResult {
  domain: string;
  userPersonas: string[];
  coreUserFlow: string;
  painPoints: string[];
  edgeCases: string[];
  architectureDiagram: string; // ASCII diagram
  openQuestions: string[];
}

const EXPLORE_PROMPT = `You are a product analyst. Before any design work, deeply EXPLORE and understand this specification.

Think like OpenSpec's explore mode: be curious, surface complexity, don't rush.

Analyze the document and return JSON:
{
  "domain": "what product domain is this? (e.g. real estate backend, e-commerce, CRM)",
  "userPersonas": ["who uses this? role + context (e.g. '房仲經紀人 managing property listings')"],
  "coreUserFlow": "the main happy path in one sentence (e.g. '選範本 → 選物件 → 付額度 → 完成')",
  "painPoints": ["potential UX friction points you can identify from the spec"],
  "edgeCases": ["edge cases mentioned or implied (e.g. '額度不足', '物件不符合規則')"],
  "architectureDiagram": "ASCII diagram of the page/screen flow, e.g.:\\n[選擇範本] → [選擇物件] → [選擇額度] → [完成]\\n              ↑ 返回          ↑ 返回\\n                              ↓ 額度不足\\n                         [購買商城]",
  "openQuestions": ["ambiguities or things not specified that a developer would need to know"]
}

Rules:
- domain: be specific, not generic
- userPersonas: include their goals and constraints
- painPoints: think about what could frustrate users
- edgeCases: these often become the most important UI states to handle
- architectureDiagram: use box-and-arrow ASCII art, show branching paths
- openQuestions: things a PM should clarify before development`;

export async function skillExplore(
  fullText: string,
  apiKey: string
): Promise<ExploreResult> {
  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({
    model: getGeminiModel(),
    generationConfig: {
      maxOutputTokens: 4096,
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  });

  const result = await model.generateContent(
    `${EXPLORE_PROMPT}\n\n=== DOCUMENT ===\n${fullText.slice(0, 20000)}\n=== END ===`
  );
  try { trackUsage(apiKey, getGeminiModel(), 'skill-explore', result.response.usageMetadata); } catch {}

  try {
    return JSON.parse(result.response.text());
  } catch {
    return {
      domain: 'unknown',
      userPersonas: [],
      coreUserFlow: '',
      painPoints: [],
      edgeCases: [],
      architectureDiagram: '',
      openQuestions: [],
    };
  }
}

// ─────────────────────────────────────────────
// Skill 2: UX REVIEW — Evaluate against best practices
// Inspired by superpowers code-reviewer: systematic quality check
// ─────────────────────────────────────────────

export interface UxReviewResult {
  overallScore: number; // 1-10
  strengths: string[];
  issues: Array<{
    severity: 'critical' | 'major' | 'minor';
    page: string;
    issue: string;
    suggestion: string;
  }>;
  accessibilityNotes: string[];
  mobileConsiderations: string[];
}

const UX_REVIEW_PROMPT = `You are a senior UX designer reviewing a specification document. Evaluate the UI/UX quality against web best practices.

Return JSON:
{
  "overallScore": 7,
  "strengths": ["things the spec does well"],
  "issues": [
    {
      "severity": "critical|major|minor",
      "page": "page name where the issue exists",
      "issue": "what's wrong",
      "suggestion": "how to fix it"
    }
  ],
  "accessibilityNotes": ["accessibility concerns (keyboard nav, screen reader, contrast)"],
  "mobileConsiderations": ["things to consider for mobile/responsive"]
}

Review criteria:
- Information hierarchy: is the most important action obvious?
- Cognitive load: too many choices at once? too many steps?
- Error prevention: does the UI prevent mistakes before they happen?
- Feedback: does every action have clear feedback?
- Navigation: can users always go back? do they know where they are?
- Consistency: are patterns reused across pages?
- Edge states: empty states, error states, loading states handled?
- Progressive disclosure: is complexity revealed gradually?`;

export async function skillUxReview(
  fullText: string,
  pages: any[],
  apiKey: string
): Promise<UxReviewResult> {
  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({
    model: getGeminiModel(),
    generationConfig: {
      maxOutputTokens: 4096,
      temperature: 0.3,
      responseMimeType: 'application/json',
    },
  });

  const pagesContext = pages.map(p =>
    `Page: ${p.name} | Components: ${(p.components || []).join(', ')} | Rules: ${(p.businessRules || []).join('; ')}`
  ).join('\n');

  const result = await model.generateContent(
    `${UX_REVIEW_PROMPT}\n\n=== SPEC TEXT ===\n${fullText.slice(0, 15000)}\n\n=== EXTRACTED PAGES ===\n${pagesContext}\n=== END ===`
  );
  try { trackUsage(apiKey, getGeminiModel(), 'skill-ux-review', result.response.usageMetadata); } catch {}

  try {
    return JSON.parse(result.response.text());
  } catch {
    return { overallScore: 5, strengths: [], issues: [], accessibilityNotes: [], mobileConsiderations: [] };
  }
}

// ─────────────────────────────────────────────
// Skill 3: DESIGN PROPOSAL — Generate design direction
// Inspired by openspec-propose: structured, opinionated, actionable
// ─────────────────────────────────────────────

export interface DesignProposalResult {
  designDirection: string;
  layoutStrategy: string;
  componentPatterns: Array<{
    pattern: string;
    usage: string;
  }>;
  colorUsage: {
    primary: string;
    whenToUse: string;
    accentSuggestions: string[];
  };
  interactionDesign: Array<{
    element: string;
    behavior: string;
  }>;
  microCopyGuidelines: string[];
}

const DESIGN_PROPOSAL_PROMPT = `You are a UI design director creating a design proposal for a prototype. Based on the spec analysis, propose concrete design decisions.

Return JSON:
{
  "designDirection": "overall visual direction in 2-3 sentences (e.g. 'Clean enterprise dashboard with step-by-step wizard flow. Purple accent for CTAs, generous whitespace, card-based layout for data display.')",
  "layoutStrategy": "how to organize the pages (e.g. 'Wizard-style with progress indicator at top. Each step in a centered card with max-width 800px. Fixed bottom bar for navigation.')",
  "componentPatterns": [
    {
      "pattern": "name of a reusable UI pattern",
      "usage": "where and how to use it across pages"
    }
  ],
  "colorUsage": {
    "primary": "when/where to use the primary brand color",
    "whenToUse": "specific guidance (e.g. 'CTAs, selected states, progress indicator. NOT for text or borders.')",
    "accentSuggestions": ["supplementary colors for states like success, warning, error"]
  },
  "interactionDesign": [
    {
      "element": "specific interactive element",
      "behavior": "how it should behave (animation, feedback, state changes)"
    }
  ],
  "microCopyGuidelines": ["guidelines for button labels, error messages, empty states in the user's language"]
}

Rules:
- Be OPINIONATED — make specific choices, not generic advice
- Reference the actual pages and components from the spec
- Propose patterns that reduce cognitive load
- Think about the user's emotional state at each step (anxious about costs? confused about rules?)
- microCopy should be in the same language as the spec (繁體中文 for Chinese specs)`;

export async function skillDesignProposal(
  fullText: string,
  pages: any[],
  explore: ExploreResult | null,
  apiKey: string
): Promise<DesignProposalResult> {
  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({
    model: getGeminiModel(),
    generationConfig: {
      maxOutputTokens: 4096,
      temperature: 0.4,
      responseMimeType: 'application/json',
    },
  });

  let context = `${DESIGN_PROPOSAL_PROMPT}\n\n=== SPEC TEXT ===\n${fullText.slice(0, 10000)}\n`;
  context += `\n=== PAGES ===\n${pages.map(p => `${p.name}: ${(p.components || []).join(', ')}`).join('\n')}\n`;
  if (explore) {
    context += `\n=== EXPLORATION INSIGHTS ===\n`;
    context += `Domain: ${explore.domain}\n`;
    context += `Users: ${explore.userPersonas.join(', ')}\n`;
    context += `Flow: ${explore.coreUserFlow}\n`;
    context += `Pain points: ${explore.painPoints.join(', ')}\n`;
    context += `Edge cases: ${explore.edgeCases.join(', ')}\n`;
  }
  context += `\n=== END ===`;

  const result = await model.generateContent(context);
  try { trackUsage(apiKey, getGeminiModel(), 'skill-design-proposal', result.response.usageMetadata); } catch {}

  try {
    return JSON.parse(result.response.text());
  } catch {
    return {
      designDirection: '',
      layoutStrategy: '',
      componentPatterns: [],
      colorUsage: { primary: '', whenToUse: '', accentSuggestions: [] },
      interactionDesign: [],
      microCopyGuidelines: [],
    };
  }
}
