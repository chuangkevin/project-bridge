import { GoogleGenerativeAI } from '@google/generative-ai';

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

Be specific with hex colors — do not guess. If a color looks purple, say purple and give the closest hex. Do not invent components that are not visible.`;

export async function analyzeDesignSpec(images: Buffer[], apiKey: string): Promise<string> {
  if (images.length === 0) return '';

  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({
    model: 'gemini-2.0-flash',
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

  return result.response.text() || '';
}
