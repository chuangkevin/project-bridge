import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiApiKey, getGeminiModel, trackUsage } from './geminiKeys';
import { DesignTokens, tokensToCssVariables } from './designTokenCompiler';

export interface PageAssignment {
  name: string;
  viewport: 'mobile' | 'desktop';
  spec: string; // Full spec text for this page
  constraints: string; // Key components and interactions
  navigationOut: string[]; // Pages this page links to
}

export interface GenerationPlan {
  shell: {
    hasNav: boolean;
    navType: 'top-bar' | 'sidebar' | 'bottom-tab' | 'none';
    navItems: string[];
    hasFooter: boolean;
  };
  sharedCss: string; // Shared CSS for nav, layout, utilities
  cssVariables: string; // :root block from design tokens
  pages: PageAssignment[];
}

/**
 * Master Agent: reads analysis result + design tokens, produces a generation plan.
 * Does NOT generate HTML — only plans the work for sub-agents.
 */
export async function planGeneration(
  analysisData: any,
  designTokens: DesignTokens | null,
  architectureBlock: string,
  designConvention: string,
  projectContext: string,
): Promise<GenerationPlan> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error('No API key available');

  const cssVariables = designTokens ? tokensToCssVariables(designTokens) : '';

  const prompt = `You are a UI architecture planner. Given the analysis of a specification document, produce a JSON generation plan.

CRITICAL RULES:
- Only generate pages that are explicitly requested. Do NOT add listing pages, property listing pages, or browse/search pages unless the user specifically asked for them.
- Use placeholder/dummy data only (e.g. "商品名稱", "NT$ 0", "使用者名稱"). Never generate fake real addresses, fake property listings, or fake real estate data.
- Generate ONLY what is needed for the requested feature.

INPUT:
${architectureBlock ? `Architecture:\n${architectureBlock}\n` : ''}
${projectContext ? `Context:\n${projectContext}\n` : ''}
${designConvention ? `Design Convention:\n${designConvention}\n` : ''}

Analysis data:
${JSON.stringify(analysisData, null, 2)}

CSS Variables available:
${cssVariables || '(use defaults)'}

OUTPUT: Return ONLY valid JSON matching this schema:
{
  "shell": {
    "hasNav": true/false,
    "navType": "top-bar" | "sidebar" | "bottom-tab" | "none",
    "navItems": ["page name 1", "page name 2"],
    "hasFooter": true/false
  },
  "sharedCss": "/* CSS for nav, layout grid, utility classes - use var(--primary) etc. */",
  "pages": [
    {
      "name": "exact page name",
      "viewport": "desktop" or "mobile",
      "spec": "full specification text for this page including components, interactions, business rules, data fields",
      "constraints": "key UI components that MUST exist on this page",
      "navigationOut": ["page names this page links to"]
    }
  ]
}

RULES:
1. Every page from the analysis MUST appear in pages array
2. spec field must include ALL components, interactions, business rules, and data fields for that page
3. navigationOut must match the analysis navigation flow exactly
4. sharedCss should define nav/header styles using CSS variables (var(--primary), var(--text), etc.)
5. sharedCss should include utility classes sub-agents can reference (.container, .card, .btn-primary, etc.)
6. If pages have mobile viewport, navType should be "bottom-tab"
7. Return ONLY JSON — no markdown, no explanation`;

  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({
    model: getGeminiModel(),
    generationConfig: { maxOutputTokens: 8192, responseMimeType: 'application/json' },
  });

  const result = await model.generateContent(prompt);
  const response = result.response;
  try { trackUsage(apiKey, getGeminiModel(), 'master-agent-plan', response.usageMetadata); } catch {}

  const text = response.text();

  // Parse JSON (strip markdown fences if present)
  let json: string = text;
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) json = fenceMatch[1];

  const plan: GenerationPlan = JSON.parse(json.trim());

  // Inject cssVariables
  plan.cssVariables = cssVariables;

  // Validate: ensure all analysis pages are present
  if (analysisData?.pages) {
    const planPageNames = new Set(plan.pages.map(p => p.name));
    for (const analysisPage of analysisData.pages) {
      if (!planPageNames.has(analysisPage.name)) {
        // Add missing page
        plan.pages.push({
          name: analysisPage.name,
          viewport: analysisPage.viewport || 'desktop',
          spec: `Components: ${(analysisPage.components || []).join(', ')}\nInteractions: ${(analysisPage.interactions || []).join('; ')}\nBusiness Rules: ${(analysisPage.businessRules || []).join('; ')}`,
          constraints: (analysisPage.components || []).join(', '),
          navigationOut: analysisPage.navigationTo || [],
        });
      }
    }
  }

  return plan;
}
