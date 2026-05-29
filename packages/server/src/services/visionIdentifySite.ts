import { generateVision, VisionUnavailableError } from './visionProvider';

const PROMPT = `Is this a screenshot of a real publicly-accessible website (a brand/product page, SaaS, documentation, etc.)?

If yes, respond with ONLY the canonical URL of the page (e.g. "https://stripe.com/pricing"). One URL on one line. No prose, no quotes.
If you are not confident or it's not a real public site, respond with exactly: unknown`;

const URL_RE = /https?:\/\/[^\s"<>'`]+/;

export type IdentifySiteResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'unknown_site' | 'vision_unavailable' };

export async function identifySite(image: { mimeType: string; base64: string }): Promise<IdentifySiteResult> {
  try {
    const raw = (await generateVision({ prompt: PROMPT, images: [image] })).trim();
    if (/^unknown$/i.test(raw)) return { ok: false, reason: 'unknown_site' };
    const m = raw.match(URL_RE);
    if (!m) return { ok: false, reason: 'unknown_site' };
    return { ok: true, url: m[0].replace(/[",.)]+$/, '') };
  } catch (err) {
    if (err instanceof VisionUnavailableError) return { ok: false, reason: 'vision_unavailable' };
    return { ok: false, reason: 'vision_unavailable' };
  }
}
