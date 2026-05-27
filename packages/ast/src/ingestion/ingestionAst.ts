// The Ingestion AST — first IR in the dual-IR pipeline. Produced by DETERMINISTIC parsers
// (no AI). The AI Semantic Builder (Plan 3) consumes this to produce the Semantic UI AST.
// The full 5-variant union is defined now; Plan 2 implements only the requirement + pdf parsers.

export interface PdfPage {
  /** 1-based page number. */
  pageNumber: number;
  /** Plain text extracted from the page (whitespace-trimmed). */
  text: string;
}

/** Chat text or pasted free-text → split into paragraphs. */
export interface RequirementIngestion {
  type: 'requirement';
  paragraphs: string[];
  source?: 'chat' | 'pasted-text';
}

/** A parsed PDF document. */
export interface PdfIngestion {
  type: 'pdf';
  pages: PdfPage[];
  pageCount: number;
  /** All page text joined with blank lines — convenience for consumers that want flat text. */
  rawText: string;
}

/** Forward-looking — parser implemented in a later plan. Sub-shape kept minimal until then. */
export interface ScreenshotRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
}

/** A screenshot/image: OCR text + coarse layout regions. Parser is a later plan. */
export interface ScreenshotIngestion {
  type: 'screenshot';
  ocrText: string;
  regions: ScreenshotRegion[];
}

/** Clipboard paste. Parser is a later plan. */
export interface ClipboardIngestion {
  type: 'clipboard';
  format: 'html' | 'image' | 'text';
  /** HTML string, base64 image, or plain text depending on `format`. */
  payload: string;
}

/** A crawled web page. Parser is a later plan (wraps the existing websiteCrawler). */
export interface WebpageIngestion {
  type: 'webpage';
  url: string;
  /** Serialized DOM / outer HTML. */
  dom: string;
  /** Base64 screenshot, optional. */
  screenshot?: string;
}

export type IngestionAst =
  | RequirementIngestion
  | PdfIngestion
  | ScreenshotIngestion
  | ClipboardIngestion
  | WebpageIngestion;

export type IngestionType = IngestionAst['type'];
