import { ProofError, fail, uuid } from './errors.mjs';

export async function parseBody(req) {
  const type=req.headers['content-type'];
  if(typeof type!=='string'||!/^application\/json(?:;|$)/i.test(type))fail(415,'json_required');
  if(req.headers['content-encoding'] && req.headers['content-encoding']!=='identity')fail(415,'content_encoding_not_supported');
  const length=req.headers['content-length'];if(length && (!/^\d+$/.test(length)||Number(length)>1024))fail(413,'request_too_large');
  let body;
  try {
    if(req.body!==undefined){
      const encoded=typeof req.body==='string'?req.body:Buffer.isBuffer(req.body)?req.body.toString('utf8'):JSON.stringify(req.body);
      if(Buffer.byteLength(encoded)>1024)fail(413,'request_too_large');body=JSON.parse(encoded);
    }else{
      const chunks=[];let size=0;for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>1024)fail(413,'request_too_large');chunks.push(Buffer.from(chunk));}
      body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
  }catch(error){if(error instanceof ProofError)throw error;fail(400,'invalid_request');}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join(',')!=='insectId,reportId,revision'
    ||!uuid(body.reportId)||!uuid(body.insectId)||!Number.isSafeInteger(body.revision)||body.revision<1)fail(400,'invalid_request');
  return {reportId:body.reportId.toLowerCase(),insectId:body.insectId.toLowerCase(),revision:body.revision};
}
export function proofConfiguration(env) {
  if(env.TRUSTED_INFERENCE_POC_ENABLED!=='true'||env.VERCEL_ENV==='production'||(env.VERCEL==='1'&&env.VERCEL_ENV!=='preview'))fail(404,'not_found');
  const ids=(env.TRUSTED_INFERENCE_ALLOWED_USER_IDS??'').split(',').map(id=>id.trim().toLowerCase()).filter(Boolean);
  if(!ids.length||!ids.every(uuid)||!env.SUPABASE_URL||!env.SUPABASE_ANON_KEY||!env.SUPABASE_SERVICE_ROLE_KEY)fail(503,'proof_not_configured');
  return {allowedUserIds:new Set(ids),supabaseUrl:env.SUPABASE_URL,anonKey:env.SUPABASE_ANON_KEY,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY};
}
/** Node IncomingMessage/ServerResponse contract also supported by Vercel helpers. */
export function createHandler({ infer, createStore, getConfig, timeoutMs=20_000 }) {
  return async function handler(req,res) {
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type','application/json');
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);timer.unref?.();
    const abort=()=>controller.abort();req.on?.('aborted',abort);
    try {
      const config=getConfig();
      if(req.method!=='POST'){res.setHeader('Allow','POST');fail(405,'method_not_allowed');}
      const auth=req.headers.authorization;
      if(typeof auth!=='string'||auth.length>8192||!/^Bearer [^\s]+$/.test(auth))fail(401,'access_token_required');
      const input=await parseBody(req);
      const store=createStore(config);
      const output=await infer(input,auth.slice(7),store,controller.signal,config);
      if(controller.signal.aborted)fail(503,'request_timeout');
      res.statusCode=200;res.end(JSON.stringify(output));
    }catch(error){
      const known=error instanceof ProofError;
      res.statusCode=known?error.status:503;
      res.end(JSON.stringify({error:known?error.code:'inference_failed',shadowOnly:true}));
    }finally{clearTimeout(timer);req.removeListener?.('aborted',abort);}
  };
}
