'use client';

/**
 * Render the first page of a PDF file or URL to a JPEG Blob & Data URL.
 * Runs strictly on the client (browser canvas).
 */
export async function renderPdfToJpegBlob(
  source: File | Blob | Uint8Array | string,
  maxDim = 1200,
  quality = 0.82
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  if (typeof window === 'undefined') {
    throw new Error('PDF rendering is only supported in client environment');
  }

  const pdfjs = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  }

  let dataArray: Uint8Array;
  if (source instanceof Uint8Array) {
    dataArray = source;
  } else if (typeof source === 'string') {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to load PDF (${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    dataArray = new Uint8Array(arrayBuffer);
  } else {
    const arrayBuffer = await source.arrayBuffer();
    dataArray = new Uint8Array(arrayBuffer);
  }

  const loadingTask = pdfjs.getDocument({
    data: dataArray,
  });

  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  try {
    const unscaledViewport = page.getViewport({ scale: 1 });

    const maxOriginalDim = Math.max(unscaledViewport.width, unscaledViewport.height);
    const scale = maxOriginalDim > maxDim ? maxDim / maxOriginalDim : 1.5;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to create canvas 2d context');
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to convert canvas to JPEG blob'))),
        'image/jpeg',
        quality
      );
    });

    return {
      blob,
      dataUrl,
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    page.cleanup();
    void pdf.destroy();
  }
}

export function createPdfFallbackDataUrl(title: string): string {
  const safeTitle = title.replace(/[<>&"]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800" fill="none">
    <rect width="600" height="800" fill="#18181b"/>
    <rect x="150" y="240" width="300" height="320" rx="20" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
    <path d="M260 320h80c11 0 20 9 20 20v120c0 11-9 20-20 20h-80c-11 0-20-9-20-20V340c0-11 9-20 20-20z" stroke="#ef4444" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="300" y="420" font-family="sans-serif" font-size="28" font-weight="bold" fill="#ef4444" text-anchor="middle">PDF</text>
    <text x="300" y="520" font-family="sans-serif" font-size="18" fill="rgba(255,255,255,0.7)" text-anchor="middle">${safeTitle.length > 24 ? safeTitle.slice(0, 22) + '...' : safeTitle}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
