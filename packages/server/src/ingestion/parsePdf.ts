import type { PdfIngestion, PdfPage } from '@designbridge/ast';

export interface ParsePdfDeps {
  /** Returns the plain text of each page, in page order. */
  extractPages: (buffer: Buffer) => Promise<string[]>;
}

/** Default page extractor — pdf-parse with a per-page `pagerender` hook. */
async function defaultExtractPages(buffer: Buffer): Promise<string[]> {
  // pdf-parse is CommonJS; default import under esModuleInterop.
  const pdfParse = (await import('pdf-parse')).default;
  const pages: string[] = [];
  await pdfParse(buffer, {
    // pdf-parse calls pagerender once per page, sequentially in page order.
    pagerender: async (pageData: { getTextContent: () => Promise<{ items: Array<{ str: string }> }> }) => {
      const content = await pageData.getTextContent();
      const text = content.items.map(it => it.str).join(' ');
      pages.push(text);
      return text;
    },
  });
  return pages;
}

/**
 * Deterministically parse a PDF buffer into a PdfIngestion (per-page text). No AI (spec §4.3).
 * The page-extraction backend is injectable for testing; defaults to pdf-parse.
 */
export async function parsePdf(
  buffer: Buffer,
  deps: Partial<ParsePdfDeps> = {},
): Promise<PdfIngestion> {
  const extractPages = deps.extractPages ?? defaultExtractPages;
  const rawPages = await extractPages(buffer);
  const pages: PdfPage[] = rawPages.map((text, i) => ({ pageNumber: i + 1, text: text.trim() }));
  return {
    type: 'pdf',
    pages,
    pageCount: pages.length,
    rawText: pages.map(p => p.text).join('\n\n'),
  };
}
