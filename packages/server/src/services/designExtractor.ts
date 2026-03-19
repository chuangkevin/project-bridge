import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiModel, trackUsage } from './geminiKeys';

export interface DesignPage {
  name: string;
  viewport: 'desktop' | 'mobile' | 'both';
  components: string[];
  layout: string;
}

export interface DesignGlobalStyles {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  borderRadius: string;
}

export interface DesignExtractionResult {
  pages: DesignPage[];
  globalStyles: DesignGlobalStyles;
  rawAnalysis: string; // Keep freeform analysis for backward compat with visual_analysis
}

const DESIGN_EXTRACTION_PROMPT = `You are analyzing UI design images for a developer to recreate in HTML/CSS.

Analyze ALL provided images and return JSON:
{
  "pages": [
    {
      "name": "descriptive page name based on what you see",
      "viewport": "desktop" | "mobile" | "both",
      "components": ["list every visible UI component: header, nav, search bar, cards, list items, buttons, tabs, modals, forms, footer, etc."],
      "layout": "describe the layout structure: e.g. 'header + hero banner + search bar + 3-column card grid + pagination + footer'"
    }
  ],
  "globalStyles": {
    "primaryColor": "#hex of main brand/accent color",
    "secondaryColor": "#hex of secondary color",
    "backgroundColor": "#hex of main background",
    "textColor": "#hex of primary text color",
    "fontFamily": "detected or best guess font family",
    "borderRadius": "estimated border radius in px"
  }
}

Rules:
- If multiple screens are shown across images, create separate page entries for each
- For viewport: single column <480px = "mobile", multi-column wide = "desktop"
- Be precise with hex colors — look at actual pixels, don't guess
- components list should be exhaustive — include every distinct UI element
- layout should describe the visual hierarchy from top to bottom`;

/**
 * Extract structured design data from UI design images.
 * Produces both structured JSON and raw text analysis for backward compatibility.
 */
export async function extractDesignData(
  images: Buffer[],
  apiKey: string
): Promise<DesignExtractionResult> {
  const genai = new GoogleGenerativeAI(apiKey);

  // Structured extraction
  const model = genai.getGenerativeModel({
    model: getGeminiModel(),
    generationConfig: {
      maxOutputTokens: 3000,
      temperature: 0,
      responseMimeType: 'application/json',
    },
  });

  const parts: any[] = [];
  for (const img of images.slice(0, 6)) {
    parts.push({
      inlineData: { mimeType: 'image/png', data: img.toString('base64') },
    });
  }
  parts.push({ text: DESIGN_EXTRACTION_PROMPT });

  const result = await model.generateContent(parts);
  try { trackUsage(apiKey, getGeminiModel(), 'extract-design', result.response.usageMetadata); } catch {}
  const text = result.response.text();

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Fallback: return minimal result
    return {
      pages: [{ name: 'Main', viewport: 'desktop', components: [], layout: '' }],
      globalStyles: {
        primaryColor: '#3b82f6',
        secondaryColor: '#64748b',
        backgroundColor: '#ffffff',
        textColor: '#0f172a',
        fontFamily: 'sans-serif',
        borderRadius: '8px',
      },
      rawAnalysis: text, // Keep raw text even if JSON failed
    };
  }

  // Also get a raw freeform analysis for backward compatibility (visual_analysis field)
  const rawModel = genai.getGenerativeModel({
    model: getGeminiModel(),
    generationConfig: { maxOutputTokens: 3000 },
  });

  let rawAnalysis = '';
  try {
    const rawResult = await rawModel.generateContent([
      ...parts.slice(0, -1), // Same images
      { text: `Analyze this UI design for a developer. Describe: device type, color palette (hex), all visible components, layout structure, typography, spacing. Be precise and detailed.` },
    ]);
    try { trackUsage(apiKey, getGeminiModel(), 'extract-design', rawResult.response.usageMetadata); } catch {}
    rawAnalysis = rawResult.response.text();
  } catch {
    rawAnalysis = text; // Use JSON text as fallback
  }

  return {
    pages: (parsed.pages || []).map((p: any) => ({
      name: p.name || 'Page',
      viewport: p.viewport || 'desktop',
      components: p.components || [],
      layout: p.layout || '',
    })),
    globalStyles: {
      primaryColor: parsed.globalStyles?.primaryColor || '#3b82f6',
      secondaryColor: parsed.globalStyles?.secondaryColor || '#64748b',
      backgroundColor: parsed.globalStyles?.backgroundColor || '#ffffff',
      textColor: parsed.globalStyles?.textColor || '#0f172a',
      fontFamily: parsed.globalStyles?.fontFamily || 'sans-serif',
      borderRadius: parsed.globalStyles?.borderRadius || '8px',
    },
    rawAnalysis,
  };
}
