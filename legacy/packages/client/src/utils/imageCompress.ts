/**
 * Compress an image file if it exceeds maxSizeBytes.
 * Uses canvas to resize and re-encode as JPEG.
 * Returns the original file if it's not an image or already small enough.
 */
export async function compressImage(file: File, maxSizeBytes = 2 * 1024 * 1024): Promise<File> {
  if (!file.type.startsWith('image/') || file.size <= maxSizeBytes) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Calculate target dimensions — scale down to fit within max
      let { width, height } = img;
      const maxDim = 2000; // max 2000px on longest side
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }

      ctx.drawImage(img, 0, 0, width, height);

      // Try quality levels until we're under maxSizeBytes
      const tryQuality = (q: number) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(file); return; }
            if (blob.size > maxSizeBytes && q > 0.3) {
              tryQuality(q - 0.1);
              return;
            }
            const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            console.log(`[imageCompress] ${(file.size / 1024 / 1024).toFixed(1)}MB → ${(compressed.size / 1024 / 1024).toFixed(1)}MB (${width}x${height}, q=${q.toFixed(1)})`);
            resolve(compressed);
          },
          'image/jpeg',
          q
        );
      };

      tryQuality(0.8);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // fallback to original
    };

    img.src = url;
  });
}
