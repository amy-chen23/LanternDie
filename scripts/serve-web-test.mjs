import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.json': 'application/json' };
http.createServer(async (req,res) => {
  let pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  // Real HTTP failures also cover engines whose worker WASM loads bypass routing.
  const missing = pathname.match(/^\/__missing-(model|wasm)(\/inference\/.*)$/);
  if (missing) {
    pathname = missing[2];
    if (pathname.endsWith(missing[1] === 'model' ? '/lanternfly-dead.onnx' : '/ort-wasm-simd-threaded.wasm')) {
      res.writeHead(404).end('missing test asset'); return;
    }
  }
  const file = path.resolve('dist', '.'+pathname);
  if (!file.startsWith(path.resolve('dist')+path.sep) && pathname !== '/') { res.writeHead(403).end(); return; }
  try {
    if (pathname === '/__inference_test') { res.setHeader('Content-Type','text/html'); res.end('<!doctype html><title>Inference QA</title>'); return; }
    const bytes = await readFile(pathname === '/' ? 'dist/index.html' : file);
    res.setHeader('Content-Type', types[path.extname(pathname === '/' ? 'index.html' : file)] ?? 'application/octet-stream');
    res.end(bytes);
  } catch { res.writeHead(404).end(); }
}).listen(4173,'127.0.0.1');
