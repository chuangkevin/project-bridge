import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiModel, trackUsage, withRetry } from './geminiKeys';

const COMPONENT_EXTRACTION_PROMPT = `You are analyzing a UI design reference image. A developer will use your analysis to recreate this design in HTML/CSS. Be precise and only describe what you actually see.

STEP 1 — DEVICE & LAYOUT:
- Is this mobile (single column, <480px) or desktop (multi-column, full-width)?
- What is the overall page structure (e.g. header + scrollable content + fixed bottom nav)?

STEP 2 — COLOR PALETTE (look carefully at actual pixel colors):
- Dominant background color (hex)
- Primary brand color used for headers, buttons, active states (hex)
- Secondary/accent colors (hex)
- Text colors: primary and secondary (hex)
- Border/divider color (hex)

STEP 3 — VISIBLE COMPONENTS (only describe what is actually present in the image):
For each component you can see, describe: layout, dimensions/spacing, colors, border-radius, shadows, typography.
Common components to look for: hero image, navigation bar, cards, list items, search bar, tags/chips, stats blocks, map, tab bar, buttons.

STEP 4 — TYPOGRAPHY:
- Font sizes for headings, subheadings, body text
- Font weight patterns
- Line height

STEP 5 — SPACING & LAYOUT DETAILS:
- Horizontal padding of content areas
- Gap between sections
- Card/item spacing
- Border radius values

STEP 6 — INPUT CONSTRAINTS:
Look for any text labels, annotations, or notes that describe input validation rules for form elements. Examples:
- "坪數：正整數，0-10000" → field: 坪數, type: number, min: 0, max: 10000
- "email format required" → field: email, type: email
- "phone: starts with 09, 10 digits" → field: phone, type: phone, pattern: ^09\\d{8}$
- "maximum 100 characters" → field: (nearby field), type: text, max: 100
- "required field" or asterisk (*) → required: true
If you find constraint descriptions, output them in a section called INPUT CONSTRAINTS with the format:
INPUT CONSTRAINTS:
- field: <field name>, type: <number|text|email|phone|date|custom>, min: <value>, max: <value>, pattern: <regex>, required: <true|false>

If no constraints are found, omit this section entirely.

Be specific with hex colors — do not guess. If a color looks purple, say purple and give the closest hex. Do not invent components that are not visible.`;

export async function analyzeDesignSpec(images: Buffer[], apiKey: string): Promise<string> {
  if (images.length === 0) return '';

  return withRetry(async (retryKey) => {
    const genai = new GoogleGenerativeAI(retryKey);
    const model = genai.getGenerativeModel({
      model: getGeminiModel(),
      generationConfig: { maxOutputTokens: 3000 },
    });

    const imageParts = images.map(buf => ({
      inlineData: {
        mimeType: 'image/png' as const,
        data: buf.toString('base64'),
      },
    }));

    const result = await model.generateContent([
      ...imageParts,
      { text: COMPONENT_EXTRACTION_PROMPT },
    ]);
    try { trackUsage(retryKey, getGeminiModel(), 'visual-analysis', result.response.usageMetadata); } catch {}

    return result.response.text() || '';
  });
}
