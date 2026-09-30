import * as ImageManipulator from 'expo-image-manipulator';

/** ai-parse-bill accepts up to ~10 MB of image; a 1600px JPEG at 0.7 is a few hundred KB. */
export const BILL_MAX_EDGE = 1600;
export const BILL_JPEG_QUALITY = 0.7;
const MAX_BASE64_BYTES = 9 * 1024 * 1024;

export interface PickedImage {
  uri: string;
  width?: number;
  height?: number;
}

/** Long edge to `BILL_MAX_EDGE` (never upscale), JPEG 0.7, base64 without the data: prefix. */
export async function prepareBillImage(img: PickedImage): Promise<{ imageBase64: string; mimeType: 'image/jpeg' }> {
  const w = img.width ?? 0;
  const h = img.height ?? 0;
  const actions: ImageManipulator.Action[] = [];
  if (w >= h && w > BILL_MAX_EDGE) actions.push({ resize: { width: BILL_MAX_EDGE } });
  else if (h > w && h > BILL_MAX_EDGE) actions.push({ resize: { height: BILL_MAX_EDGE } });
  const out = await ImageManipulator.manipulateAsync(img.uri, actions, {
    compress: BILL_JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  if (!out.base64) throw new Error('Could not read that image.');
  if (out.base64.length > MAX_BASE64_BYTES) throw new Error('That image is still too large. Try a smaller or cropped photo.');
  return { imageBase64: out.base64, mimeType: 'image/jpeg' };
}
