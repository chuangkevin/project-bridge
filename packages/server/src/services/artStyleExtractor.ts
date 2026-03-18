import yauzl from 'yauzl';

export async function extractImagesFromDocument(filePath: string, mimeType: string): Promise<Buffer[]> {
  const ext = mimeType.toLowerCase();
  const isPptx = ext.includes('presentationml') || ext.includes('pptx') || filePath.toLowerCase().endsWith('.pptx');
  const isDocx = ext.includes('wordprocessingml') || ext.includes('docx') || filePath.toLowerCase().endsWith('.docx');

  if (!isPptx && !isDocx) return [];

  const mediaFolder = isPptx ? 'ppt/media/' : 'word/media/';
  const images: Buffer[] = [];

  return new Promise((resolve) => {
    yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        resolve([]);
        return;
      }

      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        if (images.length >= 3) {
          zipfile.close();
          resolve(images);
          return;
        }

        const name = entry.fileName.toLowerCase();
        const isMedia = name.startsWith(mediaFolder.toLowerCase());
        const isImage = /\.(png|jpg|jpeg|gif|bmp|webp)$/.test(name);

        if (isMedia && isImage) {
          zipfile.openReadStream(entry, (streamErr, stream) => {
            if (streamErr || !stream) {
              zipfile.readEntry();
              return;
            }

            const chunks: Buffer[] = [];
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('end', () => {
              images.push(Buffer.concat(chunks));
              zipfile.readEntry();
            });
            stream.on('error', () => zipfile.readEntry());
          });
        } else {
          zipfile.readEntry();
        }
      });

      zipfile.on('end', () => resolve(images));
      zipfile.on('error', () => resolve(images));
    });
  });
}

export async function analyzeArtStyle(images: Buffer[], apiKey: string): Promise<string> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: { maxOutputTokens: 150 },
  });

  const imageParts = images.map(buf => ({
    inlineData: {
      mimeType: 'image/png' as const,
      data: buf.toString('base64'),
    },
  }));

  const result = await model.generateContent([
    ...imageParts,
    { text: 'Analyze the visual art style of these UI design images. In 1-2 sentences, describe: color palette, typography style, UI component style (flat/material/glassmorphism/etc), and overall aesthetic. Be concise and specific.' },
  ]);

  return result.response.text().trim() || '';
}
