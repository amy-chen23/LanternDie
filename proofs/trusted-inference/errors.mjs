export class ProofError extends Error {
  constructor(status, code) { super(code); this.status=status; this.code=code; }
}
export const fail=(status,code)=>{ throw new ProofError(status,code); };
export const uuid=value=>typeof value==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export async function boundedBytes(response,limit) {
  const length=response.headers.get('content-length');
  if(length && (!/^\d+$/.test(length)||Number(length)>limit)) { await response.body?.cancel(); fail(502,'upstream_response_too_large'); }
  const reader=response.body?.getReader(); if(!reader)return new Uint8Array();
  let size=0; const chunks=[];
  try { for(;;) {const {value,done}=await reader.read();if(done)break;size+=value.length;
    if(size>limit){await reader.cancel();fail(502,'upstream_response_too_large');} chunks.push(value);
  }} finally {reader.releaseLock();}
  const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}
