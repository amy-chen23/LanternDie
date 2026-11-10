import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { authorizedWorker, processNextReport } from './processor.ts';
import type { Job, WorkerStore } from './processor.ts';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  if (!authorizedWorker(req.headers.get('x-worker-secret'), Deno.env.get('REPORT_WORKER_SECRET'))) {
    return new Response(null, { status: 401 });
  }
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  async function rpc(name: string, args: Record<string, unknown> = {}) {
    const { data, error } = await admin.rpc(name, args);
    if (error) throw new Error('database_operation_failed');
    return data;
  }
  const lease = (job: Job) => ({ p_report_id: job.report_id, p_lease_token: job.lease_token });
  const store: WorkerStore = {
    claim: async () => (await rpc('claim_report_processing_job'))?.[0] ?? null,
    download: async path => {
      const { data, error } = await admin.storage.from('report-photos').download(path);
      if (error || !data) throw new Error('photo_unavailable');
      return data;
    },
    prepare: (job, hash) => rpc('prepare_report_processing', { ...lease(job), p_sha256: hash }),
    complete: async (job, result, model, threshold) => {
      await rpc('complete_report_processing', { ...lease(job), p_result: result, p_model_id: model, p_threshold: threshold });
    },
    fail: async (job, code) => { await rpc('fail_report_processing', { ...lease(job), p_error_code: code }); },
  };
  try {
    const status = await processNextReport(store, {
      apiKey: Deno.env.get('ROBOFLOW_API_KEY') ?? '', modelId: Deno.env.get('ROBOFLOW_MODEL_ID'),
      workspace: Deno.env.get('ROBOFLOW_WORKSPACE'), workflowId: Deno.env.get('ROBOFLOW_WORKFLOW_ID'),
      outputKey: Deno.env.get('ROBOFLOW_WORKFLOW_OUTPUT_KEY'),
      classes: (Deno.env.get('ROBOFLOW_CLASSES')
        ?? 'Adult Spotted Lanternfly,Early Nymph Spotted Lanternfly,Late Nymph Spotted Lanternfly').split(',').map(s => s.trim()).filter(Boolean),
      threshold: Number(Deno.env.get('ROBOFLOW_DETECTION_THRESHOLD') ?? '0.5'),
    });
    return Response.json({ status });
  } catch {
    return Response.json({ error: 'Worker interrupted; durable lease will recover.' }, { status: 500 });
  }
});
