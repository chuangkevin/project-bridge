import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiModel, trackUsage } from './geminiKeys';
import { PageAssignment } from './masterAgent';

/**
 * Sub-Agent: generates a single page HTML fragment.
 * Returns <div class="page" id="page-{name}" data-page="{name}">...</div>
 * with page-scoped <style> using .page-{name} prefix.
 */
export async function generatePageFragment(
  apiKey: string,
  page: PageAssignment,
  cssVariables: string,
  sharedCss: string,
  designConvention: string,
): Promise<{ name: string; html: string; success: boolean; error?: string }> {
  const pageName = page.name;

  const systemPrompt = `You are a senior frontend engineer. Generate a SINGLE PAGE for a multi-page prototype.

OUTPUT FORMAT:
Return ONLY an HTML fragment — a single <div> element:
<div class="page" id="page-${pageName}" data-page="${pageName}" style="display:none">
  <!-- Page content here, using shared CSS classes -->
</div>

DO NOT return <!DOCTYPE>, <html>, <head>, <body>, <style>, or <script> tags.

DESIGN TOKENS (pre-defined in :root — use these variables):
${cssVariables || '/* use defaults: var(--primary), var(--text), var(--bg), var(--border) */'}

SHARED CSS (use these classes for consistent look):
${sharedCss || '/* use .container, .card, .btn-primary, .btn-secondary */'}

${designConvention ? `DESIGN CONVENTION:\n${designConvention}\n` : ''}

QUALITY STANDARDS:
- 繁體中文 UI — all text in Traditional Chinese
- Fill with realistic domain-appropriate content (real product names, prices, descriptions)
- Use data-bridge-id="[unique-kebab-id]" on ALL significant elements
- All interactive elements need working onclick handlers
- Use shared CSS classes: .btn-primary, .btn-secondary, .card, .container
- Use CSS variables: var(--primary), var(--text), var(--bg), var(--border)
- Minimum 400px of meaningful, realistic content
- Include proper empty states, hover effects, active states

NAVIGATION between pages:
onclick="showPage('targetPageName');return false;"
This page links to: ${page.navigationOut.length > 0 ? page.navigationOut.join(', ') : '(none)'}

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
      generationConfig: { maxOutputTokens: 16384 },
    });

    const result = await model.generateContent(userPrompt);
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
