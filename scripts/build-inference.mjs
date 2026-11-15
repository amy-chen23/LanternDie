import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const destination = 'public/inference';
await mkdir(destination, { recursive: true });
const metadata = JSON.parse(await readFile('assets/models/model.json'));
const bytes = await readFile('assets/models/lanternfly-dead.onnx');
if (createHash('sha256').update(bytes).digest('hex') !== metadata.sha256) throw new Error('Model checksum mismatch');
await copyFile('assets/models/lanternfly-dead.onnx', `${destination}/lanternfly-dead.onnx`);
for (const name of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  await copyFile(`node_modules/onnxruntime-web/dist/${name}`, `${destination}/${name}`);
}
await copyFile('node_modules/onnxruntime-web/README.md', `${destination}/README-onnxruntime.md`);
await build({ entryPoints: ['lib/death-worker.ts'], outfile: `${destination}/death-worker.js`,
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true });
// Deliberately no CDN fallback. Every inference asset belongs to this deployment.
await writeFile(`${destination}/version.json`, JSON.stringify({ modelSha256: metadata.sha256 }));
