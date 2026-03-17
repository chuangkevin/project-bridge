import fs from 'fs';

export async function renderPdfPages(filePath: string, maxPages: number): Promise<Buffer[]> {
  try {
    // pdfjs-dist v4 — main entry is an ESM .mjs file; use dynamic import.
    // Fall back to the bare specifier if the direct path isn't resolvable.
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs').catch(() =>
      import('pdfjs-dist')
    );

    // @napi-rs/canvas ships prebuilt Windows binaries — no native compile needed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createCanvas } = require('@napi-rs/canvas') as typeof import('@napi-rs/canvas');

    const data = new Uint8Array(fs.readFileSync(filePath));

    // disableWorker avoids needing a worker thread in Node.js
    const loadingTask = pdfjsLib.getDocument({ data, disableWorker: true } as any);
    const pdf = await loadingTask.promise;

    const pageCount = Math.min(pdf.numPages, maxPages);
    const buffers: Buffer[] = [];

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = createCanvas(viewport.width, viewport.height);
      const context = canvas.getContext('2d');
      await page.render({ canvasContext: context as any, viewport }).promise;
      buffers.push(canvas.toBuffer('image/png'));
    }

    return buffers;
  } catch (err: any) {
    console.warn('[pdfPageRenderer] Failed to render PDF pages:', err?.message ?? err);
    return [];
  }
}
