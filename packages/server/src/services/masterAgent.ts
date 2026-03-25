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

  const prompt = `You are a senior UI architect for HousePrice (好房網), Taiwan's leading real estate platform.
You MUST follow the HousePrice Design System strictly. Every generated prototype must look like it belongs on houseprice.tw.

CRITICAL RULES:
- Include ALL pages from the analysis — missing pages means broken navigation
- Each page spec MUST be comprehensive: layout, components, interactions, data, edge states
- Sub-agents cannot see other pages — they rely ENTIRELY on your spec and sharedCss
- Use realistic placeholder data appropriate to the domain (product names, prices, dates)
- sharedCss must define ALL shared components (nav, footer, cards, buttons, forms, modals)

SPEC QUALITY REQUIREMENTS:
- Each page spec MUST be 200+ words
- Must include: layout description (grid/flex, columns, widths), component list (each with data fields, states, interactions), navigation to other pages, empty/loading states
- Must specify exact CSS classes from sharedCss to use

SHARED CSS REQUIREMENTS (CRITICAL):
- Must be 150+ lines of actual CSS
- Must include: CSS reset, :root with ALL design tokens, .container, .card, .btn-primary, .btn-secondary, .btn-cta, .form-group, .form-input, .form-select, nav/header/footer, .badge, .tag, grid utilities, @media responsive
- Must use HousePrice tokens: --primary: #8E6FA7, --bg: #FAF4EB, --surface: #F8F7F5, --text: #333333, etc.

ANTI-PATTERNS (VIOLATIONS):
- NEVER use #FFFFFF as page background (use #FAF4EB)
- NEVER use large solid color blocks for section backgrounds
- NEVER use gradients on hero sections (only on small CTA buttons)
- NEVER use box-shadow with blur > 4px
- NEVER use border-radius > 8px on buttons
- NEVER use non-system fonts

${designConvention ? `HOUSEPRICE DESIGN SYSTEM (MANDATORY — follow exactly):\n${designConvention.slice(0, 5000)}\n` : ''}

INPUT:
${architectureBlock ? `Architecture:\n${architectureBlock}\n` : ''}
${projectContext ? `Context:\n${projectContext}\n` : ''}

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
1. Every page from the analysis MUST appear in pages array — missing pages = broken app
2. spec field must be 200+ words with: layout description, component list with details,
   interaction flows (click X → happens Y), data fields with sample values, edge states
3. navigationOut must list exact page names this page links to
4. sharedCss MUST be comprehensive (200+ lines):
   - Reset, typography, color variables usage
   - .container (max-width, padding), .card (shadow, radius, padding)
   - .btn-primary (bg primary, hover), .btn-secondary (outline)
   - .form-group, .form-label, .form-input, .form-select
   - nav/header/footer complete styles
   - .badge, .tag, .alert, .modal-overlay
   - Grid/flexbox utility classes
   - Responsive breakpoints (@media)
5. Sub-agents CANNOT see each other's output — your spec is their ONLY reference
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
