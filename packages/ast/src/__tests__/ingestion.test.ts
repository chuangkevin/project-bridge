import { describe, it, expect } from 'vitest';
import type {
  IngestionAst, RequirementIngestion, PdfIngestion,
  ScreenshotIngestion, ClipboardIngestion, WebpageIngestion, PdfPage,
} from '../ingestion/ingestionAst';

describe('IngestionAst union', () => {
  it('accepts a requirement variant', () => {
    const r: RequirementIngestion = { type: 'requirement', paragraphs: ['a', 'b'], source: 'chat' };
    const a: IngestionAst = r;
    expect(a.type).toBe('requirement');
  });

  it('accepts a pdf variant with per-page text', () => {
    const pages: PdfPage[] = [{ pageNumber: 1, text: 'p1' }, { pageNumber: 2, text: 'p2' }];
    const p: PdfIngestion = { type: 'pdf', pages, pageCount: 2, rawText: 'p1\n\np2' };
    const a: IngestionAst = p;
    expect(a.type).toBe('pdf');
    if (a.type === 'pdf') expect(a.pages[1]?.pageNumber).toBe(2);
  });

  it('accepts screenshot / clipboard / webpage variants', () => {
    const s: ScreenshotIngestion = { type: 'screenshot', ocrText: 'hi', regions: [] };
    const c: ClipboardIngestion = { type: 'clipboard', format: 'text', payload: 'x' };
    const w: WebpageIngestion = { type: 'webpage', url: 'https://x', dom: '<html></html>' };
    const all: IngestionAst[] = [s, c, w];
    expect(all.map(a => a.type)).toEqual(['screenshot', 'clipboard', 'webpage']);
  });
});
