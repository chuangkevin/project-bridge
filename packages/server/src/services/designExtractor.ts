/**
 * designExtractor.ts — vision-based design analysis.
 *
 * analyzeDesignImage(imageBase64): extracts colors/fonts/layout from an image
 * using the AI provider's vision capability.
 *
 * Note (MEMORY): Both Codex and OpenCode adapters may throw on image inputs.
 * All calls here are wrapped in try/catch; callers receive a fallback result
 * instead of an uncaught error when vision is unavailable.
 */
import { getProvider, visionModel, withJsonInstruction, extractJsonBody, trackProviderUsage } from './provider.js';

export interface DesignAnalysis {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  borderRadius: string;
  rawAnalysis: string;
}

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
  rawAnalysis: string;
}

const FALLBACK_GLOBALS: DesignGlobalStyles = {
  primaryColor: '#3b82f6',
  secondaryColor: '#64748b',
  backgroundColor: '#ffffff',
  textColor: '#0f172a',
  fontFamily: 'sans-serif',
  borderRadius: '8px',
};

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
 * Analyse a single base64-encoded image and return a simplified DesignAnalysis.
 * Returns a fallback with default values if the vision call fails.
 */
export async function analyzeDesignImage(imageBase64: string): Promise<DesignAnalysis> {
  const visionImages = [{ type: 'inline' as const, mimeType: 'image/png', data: imageBase64 }];

  const client = getProvider();
  let text = '';
  try {
    const exec = await client.generateWithSelection({
      model: visionModel(),
      systemInstruction: withJsonInstruction(),
      prompt: DESIGN_EXTRACTION_PROMPT,
      images: visionImages,
      maxOutputTokens: 3000,
    });
    try { trackProviderUsage(exec.selection, 'analyze-design-image', exec.response); } catch {}
    text = exec.response.text;
  } catch (err: any) {
    console.warn('[designExtractor] Vision call failed (provider may not support images):', err.message?.slice(0, 100));
    return {
      ...FALLBACK_GLOBALS,
      rawAnalysis: '',
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(extractJsonBody(text));
  } catch {
    // Return best-effort fallback with raw text
    return { ...FALLBACK_GLOBALS, rawAnalysis: text };
  }

  const gs = parsed.globalStyles ?? {};
  return {
    primaryColor: gs.primaryColor || FALLBACK_GLOBALS.primaryColor,
    secondaryColor: gs.secondaryColor || FALLBACK_GLOBALS.secondaryColor,
    backgroundColor: gs.backgroundColor || FALLBACK_GLOBALS.backgroundColor,
    textColor: gs.textColor || FALLBACK_GLOBALS.textColor,
    fontFamily: gs.fontFamily || FALLBACK_GLOBALS.fontFamily,
    borderRadius: gs.borderRadius || FALLBACK_GLOBALS.borderRadius,
    rawAnalysis: text,
  };
}

/**
 * Extract structured design data from one or more UI design image Buffers.
 * Produces both structured JSON and raw text analysis for backward compatibility.
 * Returns fallback result when vision is unavailable (multimodal limitation).
 */
export async function extractDesignData(
  images: Buffer[],
  _apiKey?: string
): Promise<DesignExtractionResult> {
  const visionImages = images.slice(0, 6).map((img) => ({
    type: 'inline' as const,
    mimeType: 'image/png',
    data: img.toString('base64'),
  }));

  const client = getProvider();
  let text = '';
  try {
    const exec = await client.generateWithSelection({
      model: visionModel(),
      systemInstruction: withJsonInstruction(),
      prompt: DESIGN_EXTRACTION_PROMPT,
      images: visionImages,
      maxOutputTokens: 3000,
    });
    try { trackProviderUsage(exec.selection, 'extract-design', exec.response); } catch {}
    text = exec.response.text;
  } catch (err: any) {
    console.warn('[designExtractor] Vision call failed (provider may not support images):', err.message?.slice(0, 100));
    return {
      pages: [{ name: 'Main', viewport: 'desktop', components: [], layout: '' }],
      globalStyles: FALLBACK_GLOBALS,
      rawAnalysis: '',
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(extractJsonBody(text));
  } catch {
    return {
      pages: [{ name: 'Main', viewport: 'desktop', components: [], layout: '' }],
      globalStyles: FALLBACK_GLOBALS,
      rawAnalysis: text,
    };
  }

  let rawAnalysis = '';
  try {
    const rawExec = await client.generateWithSelection({
      model: visionModel(),
      prompt: 'Analyze this UI design for a developer. Describe: device type, color palette (hex), all visible components, layout structure, typography, spacing. Be precise and detailed.',
      images: visionImages,
      maxOutputTokens: 3000,
    });
    try { trackProviderUsage(rawExec.selection, 'extract-design', rawExec.response); } catch {}
    rawAnalysis = rawExec.response.text;
  } catch {
    rawAnalysis = text;
  }

  return {
    pages: (parsed.pages || []).map((p: any) => ({
      name: p.name || 'Page',
      viewport: p.viewport || 'desktop',
      components: p.components || [],
      layout: p.layout || '',
    })),
    globalStyles: {
      primaryColor: parsed.globalStyles?.primaryColor || FALLBACK_GLOBALS.primaryColor,
      secondaryColor: parsed.globalStyles?.secondaryColor || FALLBACK_GLOBALS.secondaryColor,
      backgroundColor: parsed.globalStyles?.backgroundColor || FALLBACK_GLOBALS.backgroundColor,
      textColor: parsed.globalStyles?.textColor || FALLBACK_GLOBALS.textColor,
      fontFamily: parsed.globalStyles?.fontFamily || FALLBACK_GLOBALS.fontFamily,
      borderRadius: parsed.globalStyles?.borderRadius || FALLBACK_GLOBALS.borderRadius,
    },
    rawAnalysis,
  };
}
