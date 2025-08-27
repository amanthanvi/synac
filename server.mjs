import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';

const DIST_DIR = resolve(process.cwd(), 'dist');
const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

function isInside(child, parent) {
  const parentPath = parent.endsWith(sep) ? parent : parent + sep;
  return child === parent || child.startsWith(parentPath);
}

async function readFileSafe(p) {
  try {
    return await fs.readFile(p);
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  try {
    const method = (req.method || 'GET').toUpperCase();
    const urlPathRaw = decodeURIComponent((req.url || '/').split('?')[0] || '/');

    if (method === 'GET' && urlPathRaw === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('ok');
      return;
    }

    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Method Not Allowed');
      return;
    }

    let urlPath = urlPathRaw;
    if (!urlPath.startsWith('/')) urlPath = '/' + urlPath;

    let filePath = resolve(DIST_DIR, '.' + urlPath);
    // If path resolves to a directory, serve index.html within it
    if (urlPath.endsWith('/')) {
      filePath = resolve(filePath, 'index.html');
    }

    // Guard against path traversal
    if (!isInside(filePath, DIST_DIR)) {
      filePath = resolve(DIST_DIR, 'index.html');
    }

    let body = await readFileSafe(filePath);

    if (!body) {
      // SPA-like fallback
      filePath = resolve(DIST_DIR, 'index.html');
      body = await readFileSafe(filePath);
    }

    if (!body) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ct = TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
    if (method === 'HEAD') {
      res.writeHead(200, { 'content-type': ct });
      res.end();
    } else {
      res.writeHead(200, { 'content-type': ct });
      res.end(body);
    }
  } catch (err) {
    try {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Internal Server Error');
    } catch {}
  }
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});

server.listen(PORT, HOST, () => {
  console.log(`[server] listening on http://${HOST}:${PORT}`);
});
