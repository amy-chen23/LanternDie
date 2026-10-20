import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { parseDetectionResponse } from './detection.ts';
import { buildInferenceRequest, unwrapWorkflowDetection } from './roboflow.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sign in to identify a report.' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'Sign in to identify a report.' }, 401);
  let reportId: string;
  try {
    const body = await req.json();
    if (typeof body?.report_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.report_id)) {
      return json({ error: 'A valid report ID is required.' }, 400);
    }
    reportId = body.report_id;
  } catch {
    return json({ error: 'A valid report ID is required.' }, 400);
  }

  // Public visibility grants read access, never permission to initiate someone else's inference.
  const { data: report, error: reportError } = await userClient.from('reports').select('photo_path')
    .eq('id', reportId).eq('user_id', user.id).maybeSingle();
  if (reportError) return json({ error: 'Could not load report.' }, 500);
  if (!report) return json({ error: 'Report not found.' }, 404);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const attemptId = crypto.randomUUID();
  const { data: claimed, error: claimError } = await admin.rpc('claim_report_identification', {
    p_report_id: reportId, p_attempt_id: attemptId,
  });
  if (claimError) return json({ error: 'Could not start identification.' }, 500);
  if (!claimed) return json({ status: 'cached_or_processing' });

  try {
    const apiKey = Deno.env.get('ROBOFLOW_API_KEY');
    const modelId = Deno.env.get('ROBOFLOW_MODEL_ID');
    const threshold = Number(Deno.env.get('ROBOFLOW_DETECTION_THRESHOLD') ?? '0.5');
    const classes = (Deno.env.get('ROBOFLOW_CLASSES')
      ?? 'Adult Spotted Lanternfly,Early Nymph Spotted Lanternfly,Late Nymph Spotted Lanternfly')
      .split(',').map(label => label.trim()).filter(Boolean);
    const config = {
      apiKey: apiKey ?? '', modelId,
      workspace: Deno.env.get('ROBOFLOW_WORKSPACE'), workflowId: Deno.env.get('ROBOFLOW_WORKFLOW_ID'),
      classes, threshold,
    };
    // Validate before downloading the photo; construct the real body below.
    buildInferenceRequest(config, '');
    const { data: photo, error: photoError } = await userClient.storage.from('report-photos').download(report.photo_path);
    if (photoError || !photo || photo.size > 5 * 1024 * 1024) throw new Error('photo');
    const bytes = new Uint8Array(await photo.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    const request = buildInferenceRequest(config, btoa(binary));
    const response = await fetch(request.endpoint, {
      method: 'POST', headers: request.headers,
      body: request.body, signal: AbortSignal.timeout(45_000),
    });
    // Never expose upstream error bodies or URLs, which may contain credentials.
    if (!response.ok) throw new Error('inference');
    const output = await response.json();
    const result = parseDetectionResponse(request.workflow
      ? unwrapWorkflowDetection(output, Deno.env.get('ROBOFLOW_WORKFLOW_OUTPUT_KEY')) : output, classes, threshold);
    const { error: saveError } = await admin.from('report_identifications').update({
      ...result, status: result.detections.length ? 'detected' : 'not_detected',
      model_id: request.sourceId, confidence_threshold: threshold, error_message: null, updated_at: new Date().toISOString(),
    }).eq('report_id', reportId).eq('attempt_id', attemptId);
    if (saveError) throw new Error('save');
    return json({ status: result.detections.length ? 'detected' : 'not_detected' });
  } catch (error) {
    const message = error instanceof Error && error.message === 'configuration'
      ? 'Identification is not configured yet. Your report is saved.'
      : 'Identification could not finish. Your report is saved; please retry.';
    const { error: saveError } = await admin.from('report_identifications').update({
      status: 'failed', error_message: message, updated_at: new Date().toISOString(),
    }).eq('report_id', reportId).eq('attempt_id', attemptId);
    if (saveError) return json({ error: 'Could not save identification status. Retry in two minutes.' }, 500);
    return json({ status: 'failed', error: message }, 502);
  }
});
