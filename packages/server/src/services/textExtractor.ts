import fs from 'fs';
import path from 'path';

export async function extractText(filePath: string, mimeType: string): Promise<string> {
  try {
    if (mimeType === 'application/pdf') {
      return await extractPdf(filePath);
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return await extractDocx(filePath);
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
      return await extractPptx(filePath);
    } else if (mimeType.startsWith('image/')) {
      return ''; // OCR runs async via extractImageOcr(); chat route reads from DB
    } else if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
      return fs.readFileSync(filePath, 'utf-8');
    } else {
      // Fallback: try reading as text
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch (err: any) {
    console.error(`Text extraction error for ${filePath}:`, err);
    return `[Error extracting text: ${err.message}]`;
  }
}

async function extractPdf(filePath: string): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default;
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

async function extractDocx(filePath: string): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

async function extractPptx(filePath: string): Promise<string> {
  // Use yauzl to unzip the .pptx and parse slide XML files
  const yauzl = await import('yauzl');
  const buffer = fs.readFileSync(filePath);

  return new Promise<string>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err: any, zipfile: any) => {
      if (err) return reject(err);

      const slideTexts: Map<string, string> = new Map();
      zipfile.readEntry();

      zipfile.on('entry', (entry: any) => {
        // Slide files are at ppt/slides/slide1.xml, ppt/slides/slide2.xml, etc.
        if (/^ppt\/slides\/slide\d+\.xml$/.test(entry.fileName)) {
          zipfile.openReadStream(entry, (err2: any, readStream: any) => {
            if (err2) return reject(err2);

            const chunks: Buffer[] = [];
            readStream.on('data', (chunk: Buffer) => chunks.push(chunk));
            readStream.on('end', () => {
              const xml = Buffer.concat(chunks).toString('utf-8');
              // Extract text content from XML — look for <a:t> tags
              const textParts: string[] = [];
              const regex = /<a:t[^>]*>(.*?)<\/a:t>/g;
              let match;
              while ((match = regex.exec(xml)) !== null) {
                textParts.push(match[1]);
              }
              slideTexts.set(entry.fileName, textParts.join(' '));
              zipfile.readEntry();
            });
          });
        } else {
          zipfile.readEntry();
        }
      });

      zipfile.on('end', () => {
        // Sort slides by number
        const sorted = [...slideTexts.entries()].sort((a, b) => {
          const numA = parseInt(a[0].match(/slide(\d+)/)?.[1] || '0');
          const numB = parseInt(b[0].match(/slide(\d+)/)?.[1] || '0');
          return numA - numB;
        });
        const text = sorted.map(([name, content], i) => `[Slide ${i + 1}] ${content}`).join('\n');
        resolve(text);
      });

      zipfile.on('error', reject);
    });
  });
}

// Singleton OCR worker — loaded once, reused across requests to avoid
// reloading chi_tra+eng models (100-300ms load vs 10-60s cold start).
let ocrWorkerPromise: Promise<any> | null = null;

function getOcrWorker(): Promise<any> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const workerOpts = process.env.TESSDATA_PREFIX ? { langPath: process.env.TESSDATA_PREFIX } : {};
      return createWorker('chi_tra+eng', 1, workerOpts);
    })().catch((err) => {
      ocrWorkerPromise = null; // allow retry on next call
      throw err;
    });
  }
  return ocrWorkerPromise;
}

// Called fire-and-forget from upload route; updates DB extracted_text when done.
export async function extractImageOcr(filePath: string): Promise<string> {
  try {
    const worker = await getOcrWorker();
    const result = await Promise.race([
      worker.recognize(filePath),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('OCR timeout after 60 seconds')), 60000)
      ),
    ]);
    return (result as any).data.text;
  } catch (err: any) {
    console.warn('[ocr] Tesseract failed:', err.message?.slice(0, 100));
    return '';
  }
}
