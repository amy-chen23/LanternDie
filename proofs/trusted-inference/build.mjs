// Creates a NEW isolated Build Output directory. Never modifies the app deployment.
import { build } from 'esbuild';
import { mkdir, cp, copyFile, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url));
const target=process.argv[2]??'linux-x64';
assert.ok(['linux-x64','darwin-arm64'].includes(target),'Supported targets: linux-x64 (hosted candidate), darwin-arm64 (local only)');
const output=path.resolve(process.argv[3]??`/private/tmp/lanterndie-shadow-${target}-${Date.now()}/.vercel/output`);
// Refuse overwrites and refuse output inside the source workspace.
assert.ok(!output.startsWith(path.resolve(here,'../..')+path.sep),'Build outside the workspace');
await mkdir(path.dirname(output),{recursive:true});
await mkdir(output,{recursive:false});
const fn=path.join(output,'functions/api/shadow-inference.func');
await mkdir(path.join(fn,'private'),{recursive:true});
await build({entryPoints:[path.join(here,'entry.mjs')],outfile:path.join(fn,'index.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',external:['onnxruntime-node','jpeg-js']});
const deps=path.join(here,'node_modules');
for(const name of ['jpeg-js','onnxruntime-common','onnxruntime-node']) {
 const dest=path.join(fn,'node_modules',name);await mkdir(dest,{recursive:true});
 await copyFile(path.join(deps,name,'package.json'),path.join(dest,'package.json'));
 for(const file of ['LICENSE','LICENSE.txt','ThirdPartyNotices.txt']) {
  try{await copyFile(path.join(deps,name,file),path.join(dest,file));}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 if(name==='jpeg-js') {for(const file of ['index.js','lib'])await cp(path.join(deps,name,file),path.join(dest,file),{recursive:true});}
 else await cp(path.join(deps,name,'dist'),path.join(dest,'dist'),{recursive:true});
 if(name==='onnxruntime-node') {
  const [platform,arch]=target.split('-'),bin=`bin/napi-v6/${platform}/${arch}`;
  await cp(path.join(deps,name,bin),path.join(dest,bin),{recursive:true});
 }
}
const model=await readFile(path.resolve(here,'../../assets/models/lanternfly-dead.onnx'));
const metadata=JSON.parse(await readFile(path.resolve(here,'../../assets/models/model.json')));
assert.equal(createHash('sha256').update(model).digest('hex'),metadata.sha256);
await writeFile(path.join(fn,'private/lanternfly-dead.onnx'),model);
await writeFile(path.join(fn,'package.json'),JSON.stringify({type:'module',private:true}));
await writeFile(path.join(fn,'.vc-config.json'),JSON.stringify({runtime:'nodejs22.x',handler:'index.mjs',launcherType:'Nodejs',shouldAddHelpers:false,architecture:'x86_64',maxDuration:30},null,2));
await writeFile(path.join(output,'config.json'),JSON.stringify({version:3,routes:[{handle:'filesystem'},{src:'/.*',status:404}]},null,2));
async function inventory(dir,prefix='') {
 let files=[];for(const entry of await readdir(dir,{withFileTypes:true})){
  const name=path.join(prefix,entry.name),full=path.join(dir,entry.name);
  files=files.concat(entry.isDirectory()?await inventory(full,name):[{path:name,bytes:(await stat(full)).size}]);
 }return files;
}
const files=await inventory(fn);
const manifest={target,hostedExecutionVerified:false,modelSha256:metadata.sha256,functionBytes:files.reduce((sum,file)=>sum+file.bytes,0),files};
await writeFile(path.join(output,'artifact-manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({output,target,functionBytes:manifest.functionBytes,modelSha256:metadata.sha256}));
