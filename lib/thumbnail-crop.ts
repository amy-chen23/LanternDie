import type { Report } from './reports';

type PhotoSize = { width: number; height: number };
type CropReport = Pick<Report, 'insects_ready' | 'insects' | 'identification'>;

/** Position the original image uniformly inside a square viewport around its detections. */
export function lanternflyThumbnailFrame(report: CropReport, size: number, photoSize?: PhotoSize | null) {
  const identification = report.identification;
  const width = identification?.image_width ?? photoSize?.width;
  const height = identification?.image_height ?? photoSize?.height;
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0
    || !Number.isFinite(size) || size <= 0) return null;

  // Match the photo/results viewer: active boxes take precedence over raw model results.
  const boxes = report.insects_ready || report.insects.length
    ? report.insects.map(insect => insect.box)
    : identification?.status === 'detected' ? identification.detections : [];
  const valid = boxes.flatMap(box => {
    if (![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) return [];
    const left = Math.max(0, box.x), top = Math.max(0, box.y);
    const right = Math.min(width, box.x + box.width), bottom = Math.min(height, box.y + box.height);
    return right > left && bottom > top ? [{ left, top, right, bottom }] : [];
  });
  if (!valid.length) return null;

  const left = Math.min(...valid.map(box => box.left)), top = Math.min(...valid.map(box => box.top));
  const right = Math.max(...valid.map(box => box.right)), bottom = Math.max(...valid.map(box => box.bottom));
  const side = Math.max(right - left, bottom - top) * 1.4;
  const cropWidth = Math.min(width, side), cropHeight = Math.min(height, side);
  const cropX = Math.max(0, Math.min(width - cropWidth, (left + right - cropWidth) / 2));
  const cropY = Math.max(0, Math.min(height - cropHeight, (top + bottom - cropHeight) / 2));
  const scale = Math.min(size / cropWidth, size / cropHeight);
  return {
    width: width * scale,
    height: height * scale,
    left: (size - cropWidth * scale) / 2 - cropX * scale,
    top: (size - cropHeight * scale) / 2 - cropY * scale,
  };
}
