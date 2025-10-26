export const bufferToHex = (buffer: ArrayBuffer): string => {
  return Array.from(new Uint8Array(buffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
};

const getCrypto = (): Crypto | null => {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    return window.crypto;
  }
  if (typeof self !== 'undefined' && (self as any).crypto?.subtle) {
    return (self as any).crypto as Crypto;
  }
  return null;
};

export const computeHashForArrayBuffer = async (data: ArrayBuffer): Promise<string> => {
  const crypto = getCrypto();
  if (!crypto?.subtle) {
    throw new Error('El entorno no soporta crypto.subtle para SHA-256.');
  }
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(digest);
};

export const computeFileHash = async (file: Blob): Promise<string> => {
  const buffer = await file.arrayBuffer();
  return computeHashForArrayBuffer(buffer);
};

export const computeStringHash = async (value: string): Promise<string> => {
  const encoder = new TextEncoder();
  return computeHashForArrayBuffer(encoder.encode(value).buffer);
};
