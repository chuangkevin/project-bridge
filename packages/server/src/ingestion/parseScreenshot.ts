import { generateVision, VisionUnavailableError } from '../services/visionProvider';
import type { ScreenshotIngestion } from '@designbridge/ast';

const PROMPT = `Look at this UI screenshot and return ONE JSON object with the following shape (no prose, no markdown fence):

{
  "ocrText": "string — all visible text concatenated, line-broken naturally",
  "regions": [
    { "x": int, "y": int, "width": int, "height": int, "text": "string — short label for what this region is, e.g. Header, Hero, PricingCard, Footer" }
  ]
}

Pixel coordinates are approximate. Prefer 3-8 high-level regions, not every tiny element.`;

export type ParseScreenshotReason = 'vision_unavailable' | 'parse_failed';
export type ParseScreenshotResult =
  | { ok: true; ingestion: ScreenshotIngestion }
  | { ok: false; reason: ParseScreenshotReason; detail?: string };

function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
}

export async function parseScreenshot(image: { mimeType: string; base64: string }): Promise<ParseScreenshotResult> {
  let raw: string;
  try {
    raw = await generateVision({ prompt: PROMPT, images: [image] });
  } catch (err) {
    if (err instanceof VisionUnavailableError) return { ok: false, reason: 'vision_unavailable', detail: err.message };
    return { ok: false, reason: 'vision_unavailable', detail: (err as Error).message };
  }

  let parsed: { ocrText?: string; regions?: Array<{ x: number; y: number; width: number; height: number; text?: string }> };
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch (err) {
    return { ok: false, reason: 'parse_failed', detail: (err as Error).message };
  }

  if (typeof parsed.ocrText !== 'string' || !Array.isArray(parsed.regions)) {
    return { ok: false, reason: 'parse_failed', detail: 'missing ocrText or regions' };
  }

  return {
    ok: true,
    ingestion: {
      type: 'screenshot',
      ocrText: parsed.ocrText,
      regions: parsed.regions.map(r => ({
        x: r.x | 0, y: r.y | 0, width: r.width | 0, height: r.height | 0, text: r.text,
      })),
    },
  };
}
