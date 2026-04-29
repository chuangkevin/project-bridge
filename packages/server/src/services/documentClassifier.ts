import { getProvider, defaultModel, withJsonInstruction, extractJsonBody, trackProviderUsage } from './provider';

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
  _apiKey?: string
): Promise<ClassificationResult> {
  const client = getProvider();
  const visionImages = images.slice(0, 2).map((img) => ({
    type: 'inline' as const,
    mimeType: 'image/png',
    data: img.toString('base64'),
  }));
  try {
    const { selection, response } = await client.generateWithSelection({
      model: defaultModel(),
      systemInstruction: withJsonInstruction(),
      prompt: `${CLASSIFICATION_PROMPT}\n\nText excerpt (first 1000 chars):\n${textHint.slice(0, 1000)}`,
      images: visionImages,
      maxOutputTokens: 1024,
    });
    try { trackProviderUsage(selection, 'classify', response); } catch {}

    try {
      const parsed = JSON.parse(extractJsonBody(response.text));
      return {
        documentType: parsed.documentType || 'spec',
        confidence: parsed.confidence || 0.5,
        reasoning: parsed.reasoning || '',
      };
    } catch {
      const isSpec = /規格|規則|流程|欄位|功能說明|大綱/.test(textHint);
      return {
        documentType: isSpec ? 'spec' : 'design',
        confidence: 0.3,
        reasoning: 'JSON parse failed, fallback classification',
      };
    }
  } catch {
    const isSpec = /規格|規則|流程|欄位|功能說明|大綱/.test(textHint);
    return {
      documentType: isSpec ? 'spec' : 'design',
      confidence: 0.3,
      reasoning: 'AI call failed, fallback classification',
    };
  }
}
