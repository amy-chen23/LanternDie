import type { Detection } from '../identify-report/detection.ts';

export type ClassifierConfig = { url: string; token: string; modelSha256: string };
export type Assessment = { model_sha256: string; scores: number[]; preprocessing_version: string };
export async function classifyPhoto(config: ClassifierConfig, image: string,
  result: { image_width: number; image_height: number; detections: Detection[] }, request: typeof fetch): Promise<Assessment> {
  const url = new URL(config.url);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || config.token.length < 32 || !/^[a-f0-9]{64}$/.test(config.modelSha256)) throw new Error('classifier_configuration');
  const response = await request(url.toString(), {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(35_000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
    body: JSON.stringify({ image_base64: image, image_width: result.image_width,
      image_height: result.image_height, boxes: result.detections }),
  });
  if (!response.ok) throw new Error('classifier_unavailable');
  const text = await response.text();
  if (text.length > 64_000) throw new Error('classifier_output');
  const output = JSON.parse(text);
  if (output.model_sha256 !== config.modelSha256 || output.preprocessing_version !== 'padded-rgb-pillow-bilinear-v1'
      || !Array.isArray(output.scores) || output.scores.length !== result.detections.length
      || !output.scores.every((v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)) {
    throw new Error('classifier_output');
  }
  return { model_sha256: output.model_sha256, scores: output.scores, preprocessing_version: output.preprocessing_version };
}
