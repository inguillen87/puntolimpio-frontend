const LOGO_PATH = '/puntolimpio.png';

let cachedLogoDataUrl: string | null = null;
let loadingPromise: Promise<string | null> | null = null;

const readBlobAsDataUrl = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });

export const getLogoDataUrl = async (): Promise<string | null> => {
    if (cachedLogoDataUrl) {
        return cachedLogoDataUrl;
    }

    if (loadingPromise) {
        return loadingPromise;
    }

    loadingPromise = fetch(LOGO_PATH)
        .then(async response => {
            if (!response.ok) {
                throw new Error(`No se pudo cargar el logo (${response.status})`);
            }
            const blob = await response.blob();
            return readBlobAsDataUrl(blob);
        })
        .then(dataUrl => {
            cachedLogoDataUrl = dataUrl;
            return dataUrl;
        })
        .catch(error => {
            console.error('Error al cargar el logo de Punto Limpio:', error);
            return null;
        })
        .finally(() => {
            loadingPromise = null;
        });

    return loadingPromise;
};
