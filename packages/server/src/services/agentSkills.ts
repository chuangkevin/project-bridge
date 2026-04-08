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
    `${EXPLORE_PROMPT}\n\n=== DOCUMENT ===\n${fullText.slice(0, 60000)}\n=== END ===`
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
    `${UX_REVIEW_PROMPT}\n\n=== SPEC TEXT ===\n${fullText.slice(0, 60000)}\n\n=== EXTRACTED PAGES ===\n${pagesContext}\n=== END ===`
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

  let context = `${DESIGN_PROPOSAL_PROMPT}\n\n=== SPEC TEXT ===\n${fullText.slice(0, 60000)}\n`;
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

// ─────────────────────────────────────────────
// Skill 4: BUSINESS CONTEXT — Internal domain knowledge
// Loads company skill files to enrich analysis with internal business logic
// ─────────────────────────────────────────────

import fs from 'fs';
import path from 'path';

export interface BusinessContextResult {
  matchedSkills: string[];
  businessRules: string[];
  dataFlows: string[];
  relatedSystems: string[];
  internalTerms: Array<{ term: string; explanation: string }>;
  implementationNotes: string[];
}

interface SkillFile {
  name: string;
  description: string;
  content: string;
}

function loadSkillFiles(): SkillFile[] {
  const skillDir = path.resolve(__dirname, '../../data/skills');
  if (!fs.existsSync(skillDir)) return [];

  const files = fs.readdirSync(skillDir).filter(f => f.endsWith('.md'));
  return files.map(f => {
    const content = fs.readFileSync(path.join(skillDir, f), 'utf-8');
    // Extract name and description from frontmatter
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    const descMatch = content.match(/^description:\s*(.+)$/m);
    return {
      name: nameMatch?.[1]?.trim() || f.replace('.md', ''),
      description: descMatch?.[1]?.trim() || '',
      content,
    };
  });
}

const BUSINESS_CONTEXT_PROMPT = `You are an internal business analyst for HousePrice (好房/新好房). You have access to internal skill documents describing business logic, data models, and system architecture.

TASK: Given a spec document, determine which internal business skills are relevant, then extract business context that would help a UI prototype engineer understand the domain deeply.

Step 1: Read the spec text and identify mentions of business concepts (會員, 社區, 實價登錄, 物件, 刊登, 刷新, 額度, etc.)
Step 2: Match against available skill descriptions to decide which skills to load
Step 3: From the matched skills, extract:
  - Business rules that the spec implies but doesn't explicitly state
  - Data flows between systems (which DB tables, which APIs)
  - Related internal systems the spec depends on
  - Internal terms and their precise meanings
  - Implementation notes for the engineering team

Return JSON:
{
  "matchedSkills": ["skill names that matched"],
  "businessRules": ["implicit business rules from domain knowledge"],
  "dataFlows": ["data flow descriptions (e.g., 'BusinessMember table → 2B member verification → display badge')"],
  "relatedSystems": ["internal systems this spec interacts with"],
  "internalTerms": [{"term": "2B會員", "explanation": "不動產經紀人/經紀業會員，有 BusinessMember 記錄"}],
  "implementationNotes": ["technical notes for engineers"]
}`;

export async function skillBusinessContext(
  fullText: string,
  pages: any[],
  apiKey: string
): Promise<BusinessContextResult> {
  const skills = loadSkillFiles();
  if (skills.length === 0) {
    return { matchedSkills: [], businessRules: [], dataFlows: [], relatedSystems: [], internalTerms: [], implementationNotes: [] };
  }

  const genai = new GoogleGenerativeAI(apiKey);

  // Step 1: Classify which skills are relevant (lightweight call)
  const classifierModel = genai.getGenerativeModel({
    model: getGeminiModel(),
    generationConfig: { maxOutputTokens: 512, temperature: 0, responseMimeType: 'application/json' },
  });

  const skillList = skills.map((s, i) => `${i}: ${s.name} — ${s.description.slice(0, 150)}`).join('\n');
  const classifyResult = await classifierModel.generateContent(
    `Given this spec text, which skill indices are relevant? Return JSON: {"indices": [0, 2]}\n\nSkills:\n${skillList}\n\nSpec (first 10000 chars):\n${fullText.slice(0, 10000)}`
  );
  try { trackUsage(apiKey, getGeminiModel(), 'skill-biz-classify', classifyResult.response.usageMetadata); } catch {}

  let matchedIndices: number[] = [];
  try {
    const parsed = JSON.parse(classifyResult.response.text());
    matchedIndices = (parsed.indices || []).filter((i: number) => i >= 0 && i < skills.length);
  } catch {
    // If classification fails, use all skills
    matchedIndices = skills.map((_, i) => i);
  }

  if (matchedIndices.length === 0) {
    return { matchedSkills: [], businessRules: [], dataFlows: [], relatedSystems: [], internalTerms: [], implementationNotes: [] };
  }

  // Step 2: Load matched skills and analyze
  const matchedSkillContent = matchedIndices
    .map(i => `=== SKILL: ${skills[i].name} ===\n${skills[i].content.slice(0, 20000)}\n=== END ===`)
    .join('\n\n');

  const pagesContext = pages.map(p =>
    `Page: ${p.name} | Components: ${(p.components || []).join(', ')}`
  ).join('\n');

  const model = genai.getGenerativeModel({
    model: getGeminiModel(),
    generationConfig: { maxOutputTokens: 4096, temperature: 0.2, responseMimeType: 'application/json' },
  });

  const result = await model.generateContent(
    `${BUSINESS_CONTEXT_PROMPT}\n\n=== INTERNAL SKILLS ===\n${matchedSkillContent}\n\n=== SPEC TEXT ===\n${fullText.slice(0, 60000)}\n\n=== PAGES ===\n${pagesContext}\n=== END ===`
  );
  try { trackUsage(apiKey, getGeminiModel(), 'skill-biz-context', result.response.usageMetadata); } catch {}

  try {
    const parsed = JSON.parse(result.response.text());
    return {
      matchedSkills: matchedIndices.map(i => skills[i].name),
      businessRules: parsed.businessRules || [],
      dataFlows: parsed.dataFlows || [],
      relatedSystems: parsed.relatedSystems || [],
      internalTerms: parsed.internalTerms || [],
      implementationNotes: parsed.implementationNotes || [],
    };
  } catch {
    return {
      matchedSkills: matchedIndices.map(i => skills[i].name),
      businessRules: [],
      dataFlows: [],
      relatedSystems: [],
      internalTerms: [],
      implementationNotes: [],
    };
  }
}
