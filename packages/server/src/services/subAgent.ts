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

${designConvention ? `HOUSEPRICE DESIGN SYSTEM (MANDATORY — follow exactly):\n${designConvention.slice(0, 5000)}\n` : ''}

❌ VIOLATIONS THAT WILL BE REJECTED:
1. Using #FFFFFF or white as page/section background → use #FAF4EB or #F8F7F5
2. Large solid color blocks (>150px height) in orange/yellow/purple as section bg
3. Drop shadows with blur > 4px → max is "0px 1px 4px rgba(0,0,0,0.15)"
4. Any font other than system sans-serif
5. border-radius > 8px on buttons (no rounded-full/pill)
6. Empty placeholder cards with just "商品名稱" repeated → use varied realistic content
7. Hero sections with full-width gradients → hero should use image or subtle bg

COLOR USAGE (CRITICAL):
- ALL brand colors MUST use CSS variables: var(--primary), var(--bg), var(--surface), var(--text), var(--text-secondary), var(--border)
- These are defined in :root via sharedCss
- NEVER hardcode #8E6FA7, #FAF4EB etc. — always use var()

CONTENT QUALITY:
- 繁體中文 UI — all visible text in Traditional Chinese
- Product cards: use VARIED names (e.g. "北歐風格沙發", "手沖咖啡壺", "無線降噪耳機"), not "商品 1", "商品 2"
- Prices: use realistic NT$ values (NT$ 1,280, NT$ 3,990, etc.)
- Forms: proper labels, input types, placeholder text, validation hints
- Tables: realistic column data, not "XXX" or "---"

LAYOUT RULES (CRITICAL — prevents broken layouts):
- ALWAYS wrap page content in <div class="container"> (max-width 1200px, centered)
- ONLY use shared CSS classes for layout: .grid, .grid-2, .grid-3, .grid-4, .flex, .flex-between, .layout-sidebar
- NEVER write inline style for width, display, grid, flex — use the shared classes
- NEVER use position:absolute/fixed for layout (only for small overlays like tooltips)
- Image placeholders: use <div style="background:#E5E5E5;aspect-ratio:16/9;border-radius:4px;"></div> — NOT purple/colored backgrounds
- Card images: <div class="card-img" style="background:#E5E5E5;height:180px;"></div>
- Tables: ALWAYS use .table class, columns use text-align:left, no word-break
- Long text: use white-space:normal; overflow-wrap:break-word; on text containers
- Tags/badges: use .tag or .badge classes with flex-wrap:wrap on parent

QUALITY STANDARDS:
- Fill with realistic domain-appropriate content (real product names, prices, descriptions)
- Use data-bridge-id="[unique-kebab-id]" on ALL significant elements
- All interactive elements need working onclick handlers
- Use shared CSS classes: .btn-primary, .btn-secondary, .card, .container
- Use CSS variables: var(--primary), var(--text), var(--bg), var(--border)
- Minimum 400px of meaningful, realistic content
- Include proper empty states, hover effects, active states
- NEVER use <style> tags — all styling via shared CSS classes or CSS variables

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
