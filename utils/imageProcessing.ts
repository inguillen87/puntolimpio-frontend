const MAX_EDGE = 1024;
const DEFAULT_QUALITY = 0.7;

const createImageElement = (dataUrl: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (event) => reject(new Error('No se pudo cargar la imagen.'));
    img.src = dataUrl;
  });
};

export const readFileAsDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Falló la lectura del archivo.'));
    reader.readAsDataURL(file);
  });
};

const drawToCanvas = (image: HTMLImageElement, maxEdge: number = MAX_EDGE): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  let { width, height } = image;
  if (width > height && width > maxEdge) {
    height = Math.round((height * maxEdge) / width);
    width = maxEdge;
  } else if (height >= width && height > maxEdge) {
    width = Math.round((width * maxEdge) / height);
    height = maxEdge;
  }
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo inicializar el contexto del canvas.');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, width, height);
  return canvas;
};

const canvasToFile = async (canvas: HTMLCanvasElement, original: File, mimeType: string, quality: number): Promise<File> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('No se pudo generar la imagen comprimida.'));
        return;
      }
      const output = new File([blob], original.name.replace(/\.[^.]+$/, '.webp'), {
        type: mimeType,
        lastModified: Date.now(),
      });
      resolve(output);
    }, mimeType, quality);
  });
};

export const preprocessImage = async (file: File, options?: { maxEdge?: number; quality?: number; mimeType?: string }): Promise<{ file: File; dataUrl: string; canvas?: HTMLCanvasElement; }> => {
  if (!file.type.startsWith('image/')) {
    const dataUrl = await readFileAsDataUrl(file);
    return { file, dataUrl };
  }

  const maxEdge = options?.maxEdge ?? MAX_EDGE;
  const quality = options?.quality ?? DEFAULT_QUALITY;
  const preferredMime = options?.mimeType ?? 'image/webp';

  const dataUrl = await readFileAsDataUrl(file);
  const image = await createImageElement(dataUrl);
  const canvas = drawToCanvas(image, maxEdge);

  try {
    const webpFile = await canvasToFile(canvas, file, preferredMime, quality);
    const optimizedDataUrl = await readFileAsDataUrl(webpFile);
    return { file: webpFile, dataUrl: optimizedDataUrl, canvas };
  } catch (error) {
    console.warn('Fallo al convertir a WEBP, se usa JPEG como respaldo.', error);
    const fallbackMime = 'image/jpeg';
    const jpegFile = await canvasToFile(canvas, file, fallbackMime, quality);
    const optimizedDataUrl = await readFileAsDataUrl(jpegFile);
    return { file: jpegFile, dataUrl: optimizedDataUrl, canvas };
  }
};
