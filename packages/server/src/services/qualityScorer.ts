import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiModel } from './geminiKeys';

export interface QualityScore {
  overall: number;       // 0-100
  html: number;          // HTML validity
  accessibility: number; // a11y (alt tags, aria, contrast)
  responsive: number;    // responsive design
  consistency: number;   // design consistency
  design: number;        // design system compliance
}

const SCORING_PROMPT = `Analyze this HTML prototype and score it 0-100 on these criteria:
1. html: Valid HTML structure, semantic tags, no broken elements
2. accessibility: Alt text on images, aria-labels, color contrast considerations, keyboard navigation support
3. responsive: Responsive design patterns, media queries, flexible layouts, viewport meta
4. consistency: Consistent colors, fonts, spacing, alignment throughout the page
5. design: Does it follow the project design system? Uses CSS variables consistently (var(--primary), var(--bg)), no hardcoded colors, no large solid color blocks, no heavy shadows, clean layout.

Return JSON only: {"html": N, "accessibility": N, "responsive": N, "consistency": N, "design": N}
where N is an integer 0-100.`;

export async function scorePrototype(html: string, apiKey: string): Promise<QualityScore> {
  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({
    model: getGeminiModel(),
    generationConfig: {
      maxOutputTokens: 200,
      temperature: 0,
      responseMimeType: 'application/json',
    },
  });

  // Truncate HTML to avoid token limits — 5000 chars is enough for quality assessment
  const truncatedHtml = html.slice(0, 5000);
  const result = await model.generateContent(SCORING_PROMPT + '\n\nHTML:\n' + truncatedHtml);
  const text = result.response.text();
  const scores = JSON.parse(text) as { html: number; accessibility: number; responsive: number; consistency: number; design: number };

  // Clamp values to 0-100
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

  return {
    html: clamp(scores.html),
    accessibility: clamp(scores.accessibility),
    responsive: clamp(scores.responsive),
    consistency: clamp(scores.consistency),
    design: clamp(scores.design || 50),
    overall: clamp(Math.round((scores.html + scores.accessibility + scores.responsive + scores.consistency + (scores.design || 50)) / 5)),
  };
}
