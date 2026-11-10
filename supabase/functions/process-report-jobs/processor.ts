import { parseDetectionResponse } from '../identify-report/detection.ts';
import { buildInferenceRequest, unwrapWorkflowDetection } from '../identify-report/roboflow.ts';

export type Job = { report_id: string; photo_path: string; lease_token: string; attempts: number };
export type WorkerConfig = Parameters<typeof buildInferenceRequest>[0] & { outputKey?: string };
export type WorkerStore = {
  claim(): Promise<Job | null>;
  download(path: string): Promise<Blob>;
  prepare(job: Job, hash: string): Promise<boolean>;
  complete(job: Job, result: ReturnType<typeof parseDetectionResponse>, model: string, threshold: number): Promise<void>;
  fail(job: Job, code: string): Promise<void>;
};

export function authorizedWorker(provided: string | null, configured: string | undefined): boolean {
  if (!configured || configured.length < 32 || !provided || provided.length !== configured.length) return false;
  let difference = 0;
  for (let i = 0; i < configured.length; i++) difference |= provided.charCodeAt(i) ^ configured.charCodeAt(i);
  return difference === 0;
}

/** One leased job per invocation. SQL, not this process, owns durable progress. */
export async function processNextReport(store: WorkerStore, config: WorkerConfig, request: typeof fetch = fetch) {
  const job = await store.claim();
  if (!job) return 'idle';
  if (job.attempts > 5) {
    await store.fail(job, 'worker_exhausted');
    return 'failed';
  }
  let errorCode = 'photo_unavailable';
  try {
    const photo = await store.download(job.photo_path);
    if (!photo.size || photo.size > 5 * 1024 * 1024) throw new Error('photo');
    const bytes = new Uint8Array(await photo.arrayBuffer());
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const hash = Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
    // Database fencing and the global hash check happen BEFORE any detector call.
    if (!await store.prepare(job, hash)) return 'duplicate';
    errorCode = 'configuration';
    buildInferenceRequest(config, '');
    errorCode = 'inference_failed';
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    const inference = buildInferenceRequest(config, btoa(binary));
    const response = await request(inference.endpoint, {
      method: 'POST', headers: inference.headers, body: inference.body,
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) throw new Error('inference');
    const output: unknown = await response.json();
    const result = parseDetectionResponse(inference.workflow
      ? unwrapWorkflowDetection(output, config.outputKey) : output, config.classes, config.threshold);
    await store.complete(job, result, inference.sourceId, config.threshold);
    return 'complete';
  } catch {
    // Error bodies, URLs, API keys and image bytes never enter client status/logs.
    // A stale worker's failure is fenced by SQL too; a later lease will recover.
    await store.fail(job, errorCode);
    return 'retry_or_admin_review';
  }
}
