import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
http.createServer(async (req,res) => {
  let pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file = path.resolve('dist', '.'+pathname);
  if (!file.startsWith(path.resolve('dist')+path.sep) && pathname !== '/') { res.writeHead(403).end(); return; }
  try {
    const bytes = await readFile(pathname === '/' ? 'dist/index.html' : file);
    res.setHeader('Content-Type', types[path.extname(pathname === '/' ? 'index.html' : file)] ?? 'application/octet-stream');
    res.end(bytes);
  } catch { res.writeHead(404).end(); }
}).listen(4173,'127.0.0.1');
