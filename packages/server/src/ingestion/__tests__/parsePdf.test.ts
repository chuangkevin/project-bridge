import { describe, it, expect } from 'vitest';
import { parsePdf } from '../parsePdf';

describe('parsePdf', () => {
  const fakeExtract = (pages: string[]) => async (_buf: Buffer) => pages;

  it('maps extracted page texts to 1-based PdfPage[] with trimmed text', async () => {
    const result = await parsePdf(Buffer.from('ignored'), {
      extractPages: fakeExtract(['  page one  ', 'page two']),
    });
    expect(result.type).toBe('pdf');
    expect(result.pageCount).toBe(2);
    expect(result.pages).toEqual([
      { pageNumber: 1, text: 'page one' },
      { pageNumber: 2, text: 'page two' },
    ]);
  });

  it('builds rawText by joining page text with blank lines', async () => {
    const result = await parsePdf(Buffer.from('x'), { extractPages: fakeExtract(['a', 'b', 'c']) });
    expect(result.rawText).toBe('a\n\nb\n\nc');
  });

  it('handles an empty PDF (zero pages)', async () => {
    const result = await parsePdf(Buffer.from('x'), { extractPages: fakeExtract([]) });
    expect(result.pageCount).toBe(0);
    expect(result.pages).toEqual([]);
    expect(result.rawText).toBe('');
  });

  it('propagates extractor errors', async () => {
    const boom = async (_b: Buffer) => { throw new Error('corrupt pdf'); };
    await expect(parsePdf(Buffer.from('x'), { extractPages: boom })).rejects.toThrow(/corrupt pdf/);
  });
});
