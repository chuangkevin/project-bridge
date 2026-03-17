import OpenAI from 'openai';

const COMPONENT_EXTRACTION_PROMPT = `Analyze these UI design spec images and extract the following component specifications. Be specific and actionable — a developer will use this to recreate these components in HTML/CSS:

1. COLOR PALETTE: List all colors with hex values (background, primary, secondary, accent, text, border colors)
2. CARD / LIST ITEM: Describe layout structure, padding, shadow, border, image placement, title/subtitle arrangement
3. SEARCH BAR: Describe shape, border style, placeholder text style, icon position, background color
4. TAGS / CHIPS / BADGES: Describe shape (pill/square), colors, font size, padding, how they group
5. NAVIGATION: Describe top nav or sidebar structure, active state styling, spacing
6. TYPOGRAPHY: Identify heading sizes, body text size, font weight patterns, line height
7. LAYOUT / GRID: Describe column count, card grid spacing, section padding patterns
8. INTERACTIVE STATES: Any visible hover/selected/active states

Format your response as a structured list matching the above categories. Be specific with measurements and colors where visible.`;

export async function analyzeDesignSpec(images: Buffer[], apiKey: string): Promise<string> {
  if (images.length === 0) return '';

  const openai = new OpenAI({ apiKey });

  const imageMessages = images.map(buf => ({
    type: 'image_url' as const,
    image_url: {
      url: `data:image/png;base64,${buf.toString('base64')}`,
      detail: 'low' as const,
    },
  }));

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: COMPONENT_EXTRACTION_PROMPT },
          ...imageMessages,
        ],
      },
    ],
    max_tokens: 1500,
  });

  return response.choices[0]?.message?.content || '';
}
