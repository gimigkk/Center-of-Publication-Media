import 'server-only';

import sharp from 'sharp';

export type PreviewMeta = { width: number; height: number; blurDataUrl: string };

// Tiny LQIP + intrinsic size so the client can reserve exact layout before the preview loads.
export async function computePreviewMeta(bytes: Uint8Array | Buffer): Promise<PreviewMeta | null> {
  try {
    const image = sharp(bytes, { failOn: 'none' });
    const { width, height, orientation } = await image.metadata();
    if (!width || !height) return null;
    const swap = (orientation ?? 1) >= 5;
    const blur = await image.rotate().resize(16).jpeg({ quality: 40 }).toBuffer();
    return {
      width: swap ? height : width,
      height: swap ? width : height,
      blurDataUrl: `data:image/jpeg;base64,${blur.toString('base64')}`,
    };
  } catch {
    return null;
  }
}
