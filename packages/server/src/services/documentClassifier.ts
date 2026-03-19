import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiModel, trackUsage } from './geminiKeys';

export type DocumentType = 'spec' | 'design' | 'screenshot' | 'mixed';

export interface ClassificationResult {
  documentType: DocumentType;
  confidence: number;
  reasoning: string;
}

const CLASSIFICATION_PROMPT = `You are classifying a document uploaded to a UI prototype tool. Based on the images and text provided, determine the document type.

Classification rules:
- "spec": Specification/requirement document (規格書). Contains: text-heavy descriptions, flow diagrams, tables with rules/fields, numbered sections, feature descriptions, business logic. Keywords: 規格, 規則, 流程, 欄位, 功能說明, 異動記錄, 大綱, 詳細說明.
- "design": UI design mockup or wireframe. Contains: clear UI components with precise layout, design tools artifacts (Figma/Sketch frames), color-coded UI elements, component spacing guides.
- "screenshot": Live website or app screenshot. Contains: real photos, real user data, browser chrome, actual content (not placeholder), production UI.
- "mixed": Contains BOTH specification text AND visual UI mockups/wireframes in the same document.

Return JSON only:
{"documentType": "spec"|"design"|"screenshot"|"mixed", "confidence": 0.0-1.0, "reasoning": "one sentence explanation"}`;

export async function classifyDocument(
  images: Buffer[],
  textHint: string,
  apiKey: string
): Promise<ClassificationResult> {
  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({
    model: getGeminiModel(),
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0,
      responseMimeType: 'application/json',
    },
  });

  const parts: any[] = [];

  // Add first 2 images for visual classification
  for (const img of images.slice(0, 2)) {
    parts.push({
      inlineData: { mimeType: 'image/png', data: img.toString('base64') },
    });
  }

  // Add text hint
  parts.push({
    text: `${CLASSIFICATION_PROMPT}\n\nText excerpt (first 1000 chars):\n${textHint.slice(0, 1000)}`,
  });

  const result = await model.generateContent(parts);
  try { trackUsage(apiKey, getGeminiModel(), 'classify', result.response.usageMetadata); } catch {}
  const text = result.response.text();

  try {
    const parsed = JSON.parse(text);
    return {
      documentType: parsed.documentType || 'spec',
      confidence: parsed.confidence || 0.5,
      reasoning: parsed.reasoning || '',
    };
  } catch {
    // Fallback: if text contains spec keywords, assume spec
    const isSpec = /規格|規則|流程|欄位|功能說明|大綱/.test(textHint);
    return {
      documentType: isSpec ? 'spec' : 'design',
      confidence: 0.3,
      reasoning: 'JSON parse failed, fallback classification',
    };
  }
}
