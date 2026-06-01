import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiApiKey, getGeminiModel } from './geminiKeys';

export interface VisionImage {
  mimeType: string;
  base64: string;
}

export interface GenerateVisionParams {
  prompt: string;
  images: VisionImage[];
  modelId?: string;
}

export class VisionUnavailableError extends Error {
  constructor(reason: string) {
    super(`vision_unavailable: ${reason}`);
    this.name = 'VisionUnavailableError';
  }
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_BACKOFF_MS = 600;

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function getStatus(err: unknown): number | undefined {
  return typeof err === 'object' && err !== null && 'status' in err
    ? (err as { status?: number }).status
    : undefined;
}

/**
 * Send a prompt + images to Gemini multimodal and return the model text.
 *
 * Side-path that bypasses MultiProviderClient. Only Plan 10 callers should use this;
 * everything else continues through getProvider().
 */
export async function generateVision(params: GenerateVisionParams): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new VisionUnavailableError('no_gemini_key_configured');

  const modelId = params.modelId ?? getGeminiModel();
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: modelId });

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: params.prompt },
    ...params.images.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.base64 } })),
  ];

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await model.generateContent(parts as never);
      return result.response.text();
    } catch (err) {
      lastErr = err;
      const status = getStatus(err);
      if (status && RETRYABLE_STATUSES.has(status) && attempt === 0) {
        await delay(RETRY_BACKOFF_MS);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
