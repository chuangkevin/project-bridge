import { getProvider, defaultModel, withJsonInstruction, extractJsonBody, trackProviderUsage } from './provider';

export interface SpecPage {
  name: string;
  viewport: 'desktop' | 'mobile' | 'both';
  components: string[];
  interactions: string[];
  dataFields: string[];
  businessRules: string[];
  navigationTo: string[];
}

export interface SpecExtractionResult {
  pages: SpecPage[];
  globalRules: string[];
  summary: string;
}

const FULL_EXTRACTION_PROMPT = `You are analyzing a software specification document (規格書). Extract ALL pages/screens and their detailed requirements in a single pass.

Analyze the provided images and FULL document text, then return JSON:
{
  "summary": "2-3 sentence summary of what this feature/system does",
  "globalRules": ["business rules that apply across ALL pages"],
  "pages": [
    {
      "name": "actual page/screen name from the document",
      "viewport": "desktop" | "mobile" | "both",
      "components": ["every UI component: search bars, filters, tables, lists, buttons, modals, fixed bars, forms, cards, tabs, etc."],
      "interactions": ["user action → system response (e.g. '點擊編輯 → 開啟修改燈箱')"],
      "dataFields": ["actual field names from the spec (e.g. '範本名稱', '刷新次數')"],
      "businessRules": ["constraints, limits, conditions specific to this page"],
      "navigationTo": ["names of other pages this page can navigate to"]
    }
  ]
}

Rules:
- Page names: use the EXACT names from the document (e.g. "選擇範本", "選擇物件", "選擇額度")
- Include ALL pages/screens/steps mentioned, even if briefly described
- viewport: "mobile" if spec mentions M版/手機版, "desktop" if web版/Web, "both" if both shown
- components: be exhaustive — list every distinct UI element described or shown
- interactions: format as "action → result" pairs
- dataFields: actual data field names, not descriptions
- businessRules: specific constraints with numbers/limits (e.g. "至少3次", "最多5個")
- navigationTo: which other pages each page links to
- Be thorough — extract EVERYTHING. This JSON will be used to generate the UI prototype.`;

/**
 * Extract structured data from a specification document.
 * Single-call approach: sends full text + images, gets all pages in one JSON response.
 * This minimizes API calls (1 call instead of N+2).
 */
export async function extractSpecData(
  fullText: string,
  images: Buffer[],
  _apiKey?: string
): Promise<SpecExtractionResult> {
  const visionImages = images.slice(0, 4).map((img) => ({
    type: 'inline' as const,
    mimeType: 'image/png',
    data: img.toString('base64'),
  }));

  const { selection, response } = await getProvider().generateWithSelection({
    model: defaultModel(),
    systemInstruction: withJsonInstruction(),
    prompt: `${FULL_EXTRACTION_PROMPT}\n\n=== FULL DOCUMENT TEXT ===\n${fullText.slice(0, 80000)}\n=== END ===`,
    images: visionImages,
    maxOutputTokens: 16384,
  });
  try { trackProviderUsage(selection, 'extract-spec', response); } catch {}

  try {
    const parsed = JSON.parse(extractJsonBody(response.text));
    const pages: SpecPage[] = (parsed.pages || []).map((p: any) => ({
      name: p.name || 'Unknown',
      viewport: p.viewport || 'both',
      components: p.components || [],
      interactions: p.interactions || [],
      dataFields: p.dataFields || [],
      businessRules: p.businessRules || [],
      navigationTo: p.navigationTo || [],
    }));

    return {
      pages,
      globalRules: parsed.globalRules || [],
      summary: parsed.summary || '',
    };
  } catch {
    console.warn('[specExtractor] Failed to parse full extraction JSON');
    return {
      pages: [{ name: '主頁面', viewport: 'both', components: [], interactions: [], dataFields: [], businessRules: [], navigationTo: [] }],
      globalRules: [],
      summary: 'Extraction failed — JSON parse error',
    };
  }
}
