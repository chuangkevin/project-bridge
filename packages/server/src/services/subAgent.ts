import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiModel, trackUsage } from './geminiKeys';
import { PageAssignment } from './masterAgent';

/**
 * Sub-Agent: generates a single page HTML fragment.
 * Returns <div class="page" id="page-{name}" data-page="{name}">...</div>
 * with page-scoped <style> using .page-{name} prefix.
 */
export interface SkillForSubAgent {
  name: string;
  content: string;
}

export async function generatePageFragment(
  apiKey: string,
  page: PageAssignment,
  cssVariables: string,
  sharedCss: string,
  designConvention: string,
  skills: SkillForSubAgent[] = [],
): Promise<{ name: string; html: string; success: boolean; error?: string }> {
  const pageName = page.name;

  // Build business rules section from skills
  const businessRules = skills.length > 0
    ? `\nBUSINESS RULES (from project knowledge base — follow these):\n${skills.map(s => `【${s.name}】${s.content}`).join('\n\n')}\n`
    : '';

  const systemPrompt = `You are a senior frontend engineer. Generate a SINGLE PAGE for a multi-page prototype.

OUTPUT FORMAT:
Return ONLY an HTML fragment — a single <div> element:
<div class="page" id="page-${pageName}" data-page="${pageName}" style="display:none">
  <!-- Page content here, using shared CSS classes -->
</div>

DO NOT return <!DOCTYPE>, <html>, <head>, <body>, <style>, or <script> tags.

⚠️⚠️⚠️ CRITICAL — DO NOT INCLUDE ANY OF THESE (they are added by the assembler):
- NO <nav> elements
- NO <header> with class "site-header"
- NO <footer> with class "site-footer"
- NO navigation bars or menus
- NO site logo or brand name header
Your div should contain ONLY the page's unique content (forms, lists, cards, tables, etc.)

MINIMUM CONTENT: Your page div must contain at least 500 characters of actual HTML content.
An empty or near-empty page is a FAILURE.

DESIGN TOKENS (pre-defined in :root — use these variables):
${cssVariables || '/* use defaults: var(--primary), var(--text), var(--bg), var(--border) */'}

SHARED CSS (use these classes for consistent look):
${sharedCss || '/* use .container, .card, .btn-primary, .btn-secondary */'}

${designConvention ? `DESIGN SYSTEM (follow the design direction):\n${designConvention.slice(0, 5000)}\n` : ''}
${businessRules}
⚠️⚠️⚠️ COLOR USAGE — ABSOLUTELY CRITICAL:
- ALL colors MUST use CSS variables: var(--primary), var(--bg), var(--surface), var(--text), var(--text-secondary), var(--border), var(--header-bg), var(--nav-bg), var(--divider)
- NEVER hardcode ANY hex color values (#XXXXXX) — always use var() references
- The :root CSS variables already contain the correct brand colors from the design preset
- Buttons: .btn-primary uses var(--primary), .btn-cta uses var(--accent-cta)
- Backgrounds: page uses var(--bg), cards use var(--surface)
- Text: primary var(--text), secondary var(--text-secondary)
- Image placeholders: use <div style="background:var(--divider);aspect-ratio:16/9;border-radius:var(--radius-md);"></div>

CONTENT QUALITY:
- 繁體中文 UI — all visible text in Traditional Chinese
- Use VARIED, realistic content appropriate to the domain (real product names, prices, descriptions)
- Prices: use realistic NT$ values (NT$ 1,280, NT$ 3,990, etc.)
- Forms: proper labels, input types, placeholder text
- NEVER use placeholder text like "商品 1", "商品 2", "XXX"

LAYOUT RULES (CRITICAL — prevents broken layouts):
- ALWAYS wrap page content in <div class="container"> (max-width 1200px, centered)
- ONLY use shared CSS classes for layout: .grid, .grid-2, .grid-3, .grid-4, .flex, .flex-between, .layout-sidebar
- NEVER write inline style for width, display, grid, flex — use the shared classes
- NEVER use position:absolute/fixed for layout (only for small overlays)
- NEVER use writing-mode: vertical or any vertical text layout
- ⚠️ NEVER use <img src="https://..."> or ANY external image URL (no placeholder.com, no picsum.photos, no unsplash)
- Card images: <div class="card-img" style="background:var(--divider);height:180px;"></div>
- Hero/banner: <div style="background:var(--divider);aspect-ratio:16/9;border-radius:var(--radius-md);"></div>
- Tables: ALWAYS use .table class
- Tags/badges: use .tag or .badge with flex-wrap:wrap on parent
- Forms: use .form-group > .form-label + .form-input pattern. ALL inputs must be full-width.
- NEVER use narrow columns (<200px) for form content — forms should always be in a wide area

QUALITY STANDARDS:
- Use data-bridge-id="[unique-kebab-id]" on ALL significant elements
- All interactive elements need working onclick handlers
- Use shared CSS classes: .btn-primary, .btn-secondary, .card, .container
- Minimum 400px of meaningful, realistic content
- NEVER use <style> tags — all styling via shared CSS classes or CSS variables

NAVIGATION between pages (CRITICAL — cards/buttons MUST link to detail pages):
- Use onclick="showPage('targetPageName');return false;" on cards, buttons, links
- Every card in a list MUST have a clickable link to its detail page
- This page links to: ${page.navigationOut.length > 0 ? page.navigationOut.join(', ') : '(none)'}

${page.viewport === 'mobile' ? `MOBILE: single column, max-width 480px, touch targets 48px+, text 15-16px` : 'DESKTOP: responsive layout, grid/flexbox, max-width 1200px'}`;

  const userPrompt = `Generate the "${pageName}" page [${page.viewport.toUpperCase()}]:

SPECIFICATION:
${page.spec}

KEY CONSTRAINTS:
${page.constraints}

Generate the complete page fragment now. Return ONLY the <div class="page"> element with all content inside.`;

  try {
    const genai = new GoogleGenerativeAI(apiKey);
    const model = genai.getGenerativeModel({
      model: getGeminiModel(),
      systemInstruction: systemPrompt,
      generationConfig: { maxOutputTokens: 8192 },
    });

    // 60 second timeout per page
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout generating ${pageName}`)), 60000)
    );
    const result = await Promise.race([model.generateContent(userPrompt), timeoutPromise]);
    const response = result.response;
    try { trackUsage(apiKey, getGeminiModel(), `sub-agent-${pageName}`, response.usageMetadata); } catch {}

    let html = response.text().trim();

    // Strip markdown fences if present
    const fenceMatch = html.match(/```(?:html)?\s*([\s\S]*?)```/);
    if (fenceMatch) html = fenceMatch[1].trim();

    // If sub-agent returned full HTML instead of fragment, extract the page div or body
    if (html.toLowerCase().includes('<!doctype') || html.toLowerCase().includes('<html')) {
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        html = bodyMatch[1].trim();
      }
    }

    // Ensure wrapped in page div
    if (!html.includes(`id="page-${pageName}"`)) {
      html = `<div class="page" id="page-${pageName}" data-page="${pageName}" style="display:none">\n${html}\n</div>`;
    }

    return { name: pageName, html, success: true };
  } catch (err: any) {
    return { name: pageName, html: '', success: false, error: err.message?.slice(0, 200) || 'unknown' };
  }
}
