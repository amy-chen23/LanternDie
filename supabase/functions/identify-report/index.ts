// Compatibility endpoint: owner-requested technical retry only. Detection is now
// performed by the scheduled durable worker, never in this HTTP request.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sign in required.' }, 401);
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  });
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return json({ error: 'Sign in required.' }, 401);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Valid report ID required.' }, 400); }
  if (typeof body?.report_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.report_id)) {
    return json({ error: 'Valid report ID required.' }, 400);
  }
  const { error } = await client.rpc('retry_report_processing', { p_report_id: body.report_id });
  if (error) return json({ error: 'Retry unavailable. Wait 15 minutes after a technical failure; resolved reports cannot be retried.' }, 409);
  return json({ status: 'queued' }, 202);
});
