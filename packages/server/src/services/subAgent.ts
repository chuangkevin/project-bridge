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

  const systemPrompt = `You are a UI prototype engineer generating a SINGLE PAGE FRAGMENT for a multi-page prototype.

CRITICAL RULES:
- Use placeholder/dummy data only (e.g. "商品名稱", "NT$ 0", "使用者名稱"). Never generate fake real addresses, fake property listings, or fake real estate data.
- Only generate the content that was requested for this specific page. Do not add listing pages or browse pages unless explicitly requested.

OUTPUT FORMAT:
Return ONLY an HTML fragment — a single <div> element:
<div class="page" id="page-${pageName}" data-page="${pageName}" style="display:none">
  <!-- All page content here -->
</div>

DO NOT return <!DOCTYPE>, <html>, <head>, or <body> tags.
DO NOT include <style> or <script> tags — the assembler handles shared styles.

DESIGN TOKENS (use these CSS variables — they are pre-defined in :root):
${cssVariables || '/* default tokens */'}

SHARED CSS CLASSES (use these for consistency):
${sharedCss || '/* no shared CSS */'}

${designConvention ? `DESIGN CONVENTION:\n${designConvention}\n` : ''}

VISUAL QUALITY:
- Fill the page with realistic, domain-appropriate content — NO placeholders
- Use data-bridge-id="[unique-kebab-id]" on ALL significant elements
- All interactive elements need working onclick handlers
- Buttons use class="btn-primary" or "btn-secondary" (defined in shared CSS)
- Cards use class="card" (defined in shared CSS)
- Use var(--primary), var(--text), var(--bg), etc. for all colors
- Typography: var(--font-family), sizes from design tokens
- Minimum content: at least 400px of meaningful content

NAVIGATION:
- To navigate to another page, use: onclick="showPage('targetPageName');return false;"
- This page links to: ${page.navigationOut.length > 0 ? page.navigationOut.join(', ') : '(no outgoing links)'}

${page.viewport === 'mobile' ? `MOBILE LAYOUT:
- Single column, max-width: 480px, margin: 0 auto
- Touch targets min 48px tall
- Body text 15-16px, headings 22-28px
- Cards full-width, stacked vertically
- Form inputs full-width, min-height 48px` : ''}`;

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
