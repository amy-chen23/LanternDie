export type Detection = {
  label: string;
  confidence: number;
  // Pixel coordinates of the top-left corner in the stored inference image.
  x: number;
  y: number;
  width: number;
  height: number;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid detection response.');
  }
  return value as Record<string, unknown>;
}

function finite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid detection response.');
  return value;
}

export function parseDetectionResponse(value: unknown, classes: string[], threshold: number) {
  const response = record(value);
  const image = record(response.image);
  const width = finite(image.width);
  const height = finite(image.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0
    || !Array.isArray(response.predictions) || response.predictions.length > 1000) {
    throw new Error('Invalid detection response.');
  }
  const allowed = new Set(classes.map(label => label.trim().toLowerCase()));
  const detections: Detection[] = [];
  for (const value of response.predictions) {
    const prediction = record(value);
    const confidence = finite(prediction.confidence);
    const x = finite(prediction.x);
    const y = finite(prediction.y);
    const boxWidth = finite(prediction.width);
    const boxHeight = finite(prediction.height);
    if (confidence < 0 || confidence > 1 || boxWidth <= 0 || boxHeight <= 0 || typeof prediction.class !== 'string') {
      throw new Error('Invalid detection response.');
    }
    if (!allowed.has(prediction.class.trim().toLowerCase()) || confidence < threshold) continue;
    // Roboflow uses center coordinates. Clamp boxes to the image boundary.
    const left = Math.max(0, x - boxWidth / 2);
    const top = Math.max(0, y - boxHeight / 2);
    const right = Math.min(width, x + boxWidth / 2);
    const bottom = Math.min(height, y + boxHeight / 2);
    if (right <= left || bottom <= top) continue;
    detections.push({ label: prediction.class, confidence, x: left, y: top, width: right - left, height: bottom - top });
  }
  return { image_width: width, image_height: height, detections };
}
