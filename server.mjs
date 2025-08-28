#!/usr/bin/env node
import { createServer } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import { pipeline } from 'node:stream/promises';

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3000);
const DIST_DIR = path.resolve(process.cwd(), 'dist');

let DIST_REAL = null;
try {
  const st = await fsp.stat(DIST_DIR);
  if (st.isDirectory()) {
    DIST_REAL = await fsp.realpath(DIST_DIR);
  } else {
    console.warn('dist is not a directory; server will still start');
  }
} catch {
  console.warn(`dist directory not found at ${DIST_DIR}; server will still start`);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
};

const ALLOWED_EXT = new Set(Object.keys(TYPES));

export const HASH_RE = /(?:\.[A-Za-z0-9_-]{8,}\.|[.-][a-f0-9]{8,}\.)/;

function getContentType(ext) {
  return TYPES[ext] || 'application/octet-stream';
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function computeCacheControl(ext, baseName) {
  if (ext === '.html') {
    return {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    };
  }
  if (HASH_RE.test(baseName)) {
    return { 'Cache-Control': 'public, max-age=31536000, immutable' };
  }
  return { 'Cache-Control': 'public, max-age=3600' };
}

function sendText(res, status, body, extra = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Accept-Ranges', 'none');
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
}

function wantsHtml(accept) {
  return typeof accept === 'string' && accept.toLowerCase().includes('text/html');
}
function hasExtension(p) {
  return /\.[^/]+$/.test(p);
}

async function tryServeFile(absPath, method, res) {
  try {
    let real = absPath;
    if (DIST_REAL) {
      real = await fsp.realpath(absPath);
      if (!isInside(real, DIST_REAL)) {
        return { served: false, status: 403 };
      }
    }
    const s = await fsp.stat(real);
    if (!s.isFile()) return { served: false, status: 404 };
    const ext = path.extname(real).toLowerCase();
    if (ext && !ALLOWED_EXT.has(ext)) return { served: false, status: 403 };
    const base = path.basename(real);
    const etag = `W/"${s.size}-${Math.floor(s.mtimeMs)}"`;
    const inm = res.req?.headers?.['if-none-match'];
    if (inm && inm === etag) {
      res.statusCode = 304;
      res.setHeader('ETag', etag);
      res.setHeader('Accept-Ranges', 'none');
      res.end();
      return { served: true, status: 304, bytes: 0 };
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', getContentType(ext));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Accept-Ranges', 'none');
    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', new Date(s.mtimeMs).toUTCString());
    const cache = computeCacheControl(ext, base);
    for (const [k, v] of Object.entries(cache)) res.setHeader(k, v);
    res.setHeader('Content-Length', String(s.size));
    if (method === 'HEAD') {
      res.end();
      return { served: true, status: 200, bytes: 0 };
    }
    const stream = fs.createReadStream(real);
    const onClose = () => stream.destroy();
    res.on('close', onClose);
    await pipeline(stream, res).catch((err) => {
      if (!res.headersSent) sendText(res, 500, 'Internal Server Error');
      else res.destroy();
    });
    res.off('close', onClose);
    return { served: true, status: 200, bytes: s.size };
  } catch (err) {
    if (err && err.code === 'ENOENT') return { served: false, status: 404 };
    console.error('tryServeFile error', err);
    return { served: false, status: 500 };
  }
}

function pickIndexPath(pathname) {
  return pathname.endsWith('/') ? pathname + 'index.html' : pathname + '/index.html';
}

const sockets = new Set();

const server = createServer(async (req, res) => {
  const start = process.hrtime.bigint();
  let bytes = 0;
  let status = 500;
  let pathForLog = '-';
  const method = (req.method || 'GET').toUpperCase();

  const logDone = () => {
    const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
    const st = typeof res.statusCode === 'number' ? res.statusCode : status;
    const b = bytes || Number(res.getHeader('content-length') || 0) || 0;
    console.log(
      `method=${method} path=${pathForLog} status=${st} ms=${ms.toFixed(1)}${b ? ` bytes=${b}` : ''}`,
    );
  };
  res.once('finish', logDone);
  res.once('close', logDone);

  try {
    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'none',
        Allow: 'GET, HEAD',
      });
      res.end('Method Not Allowed');
      status = 405;
      return;
    }

    let urlPathRaw = '/';
    try {
      const u = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      urlPathRaw = u.pathname || '/';
      decodeURIComponent(urlPathRaw);
    } catch (e) {
      console.error(e?.stack || e);
      sendText(res, 400, 'Bad Request');
      status = 400;
      return;
    }

    pathForLog = urlPathRaw;

    if (urlPathRaw === '/health') {
      const body = 'ok';
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'none',
        'Content-Length': String(Buffer.byteLength(body)),
      });
      if (method === 'HEAD') {
        res.end();
        bytes = 0;
      } else {
        res.end(body);
        bytes = Buffer.byteLength(body);
      }
      status = 200;
      return;
    }

    const candidate = path.resolve(DIST_DIR, '.' + (urlPathRaw || '/'));
    const rel = path.relative(DIST_DIR, candidate);
    if (rel.startsWith('..') || path.isAbsolute(rel) || urlPathRaw.includes('\0')) {
      sendText(res, 403, 'Forbidden');
      status = 403;
      return;
    }

    const ext = path.extname(candidate).toLowerCase();

    if (ext && ALLOWED_EXT.has(ext)) {
      const r = await tryServeFile(candidate, method, res);
      if (r?.served) {
        status = r.status;
        bytes = r.bytes || 0;
        return;
      }
      if (r?.status === 404) {
        sendText(res, 404, 'Not Found');
        status = 404;
        return;
      }
      sendText(res, 500, 'Internal Server Error');
      status = 500;
      return;
    }

    const accept = String(req.headers['accept'] || '').toLowerCase();
    const htmlEligible = !ext || accept.includes('text/html');

    if (htmlEligible) {
      const indexPath = path.resolve(DIST_DIR, '.' + pickIndexPath(urlPathRaw));
      const indexRel = path.relative(DIST_DIR, indexPath);
      if (!(indexRel.startsWith('..') || path.isAbsolute(indexRel))) {
        const rIdx = await tryServeFile(indexPath, method, res);
        if (rIdx?.served) {
          status = rIdx.status;
          bytes = rIdx.bytes || 0;
          return;
        }
      }
      if (urlPathRaw.endsWith('.html')) {
        const rHtml = await tryServeFile(candidate, method, res);
        if (rHtml?.served) {
          status = rHtml.status;
          bytes = rHtml.bytes || 0;
          return;
        }
      }
      const fbPath = path.resolve(DIST_DIR, './index.html');
      const fbRel = path.relative(DIST_DIR, fbPath);
      if (!(fbRel.startsWith('..') || path.isAbsolute(fbRel))) {
        const rFb = await tryServeFile(fbPath, method, res);
        if (rFb?.served) {
          status = rFb.status;
          bytes = rFb.bytes || 0;
          return;
        }
      }
    }

    sendText(res, 404, 'Not Found');
    status = 404;
  } catch (err) {
    console.error(err?.stack || err);
    try {
      sendText(res, 500, 'Internal Server Error');
    } catch {}
    status = 500;
  }
});

server.on('connection', (socket) => {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
});

let shuttingDown = false;
function initiateShutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('shutdown=initiated');
  server.close(() => console.log('shutdown=server-closed'));
  sockets.forEach((s) => {
    try {
      s.end();
    } catch {}
  });
  const t = setTimeout(() => {
    sockets.forEach((s) => {
      try {
        s.destroy();
      } catch {}
    });
    console.log('shutdown=forced');
    process.exit(0);
  }, 10_000);
  t.unref();
  server.once('close', () => {
    console.log('shutdown=complete');
    process.exit(0);
  });
}
process.on('SIGTERM', initiateShutdown);
process.on('SIGINT', initiateShutdown);

server.listen(PORT, HOST, () => {
  console.log(`Static server listening on http://${HOST}:${PORT} serving ${DIST_DIR}`);
});
