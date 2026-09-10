/**
 * Image compressor for station and tool photos using HTML5 Canvas
 */
export function compressImageBase64(
  source: string | File | Blob,
  maxSide: number = 640,
  maxHeight: number = 640,
  quality: number = 0.6
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      return resolve(typeof source === 'string' ? source : '');
    }

    const processDataUrl = (dataUrl: string) => {
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        const scale = Math.min(1, maxSide / Math.max(w, h, 1), maxHeight / Math.max(h, 1));
        w = Math.round(w * scale);
        h = Math.round(h * scale);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(dataUrl);
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.src = dataUrl;
    };

    if (typeof source === 'string') {
      processDataUrl(source);
    } else {
      const reader = new FileReader();
      reader.onload = () => processDataUrl(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(source);
    }
  });
}
