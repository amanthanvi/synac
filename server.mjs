import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { extname, resolve, normalize, sep, basename } from 'node:path';
import { pipeline } from 'node:stream/promises';

/**
 * Minimal, hardened static file server for production previews.
 * - Streams files (no in-memory reads)
 * - Canonical path validation with realpath (CodeQL-safe)
 * - Restricts SPA fallback to HTML-eligible requests only
 * - Correct content types, caching, Last-Modified, nosniff, Accept-Ranges: none
 * - GET and HEAD support
 * - Graceful shutdown with active connection tracking
 */

const HOST = '0.0.0.0';
const PORT = Number(process.env.PORT || 3000);

// Compute DIST_DIR absolute and its canonical real path once.
const DIST_DIR = resolve(process.cwd(), 'dist');
let DIST_REAL = DIST_DIR;
try {
  DIST_REAL = await realpath(DIST_DIR);
} catch {
  // Keep running; requests will 404 until dist exists.
  console.warn('dist directory not found or not yet built');
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

const ASSET_EXTS = new Set([
  '.js',
  '.mjs',
  '.css',
  '.map',
  '.json',
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
  '.webp',
  '.ico',
  '.txt',
  '.xml',
  '.webmanifest',
  '.woff',
  '.woff2',
  '.ttf',
  '.wasm',
]);

const HASH_RE = /\.[0-9a-f]{8,}\./i;

function isInside(child, parent) {
  const parentPath = parent.endsWith(sep) ? parent : parent + sep;
  return child === parent || child.startsWith(parentPath);
}

function getContentType(ext) {
  return TYPES[ext] || 'application/octet-stream';
}

function wantsHtml(acceptHeader) {
  return typeof acceptHeader === 'string' && acceptHeader.includes('text/html');
}

function hasExtension(p) {
  return /\.[^/]+$/.test(p);
}

async function tryServeFile(absPath, method, res) {
  // Ensure the resolved candidate path is within the dist dir before any attempt
  if (!isInside(absPath, DIST_DIR)) {
    return false;
  }

  let s;
  try {
    s = await stat(absPath);
    if (!s.isFile()) return false;
  } catch {
    return false; // file does not exist
  }

  // Canonicalize and enforce that the real path is within DIST_REAL
  let real;
  try {
    real = await realpath(absPath);
  } catch {
    return false;
  }
  if (!isInside(real, DIST_REAL)) {
    // Symlink escape attempt: deny
    return false;
  }

  const ext = extname(real).toLowerCase();
  const ct = getContentType(ext);

  const headers = {
    'Content-Type': ct,
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'none',
    'Last-Modified': s.mtime.toUTCString(),
    'Content-Length': String(s.size),
  };

  // Cache-Control policy
  if (ext === '.html') {
    headers['Cache-Control'] = 'no-cache';
  } else if (HASH_RE.test(basename(real))) {
    headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  } else {
    headers['Cache-Control'] = 'public, max-age=3600';
  }

  res.writeHead(200, headers);
  if (method === 'HEAD') {
    res.end();
    return { bytes: 0, status: 200 };
  }

  await pipeline(createReadStream(real), res);
  return { bytes: s.size, status: 200 };
}

function isAssetRequest(relPath) {
  const ext = extname(relPath).toLowerCase();
  return ext ? ASSET_EXTS.has(ext) || Object.prototype.hasOwnProperty.call(TYPES, ext) : false;
}

const sockets = new Set();

const server = createServer(async (req, res) => {
  const start = process.hrtime.bigint();
  let status = 500;
  let bytes;
  let pathForLog = '-';
  const method = (req.method || 'GET').toUpperCase();

  let logged = false;
  function logDone() {
    if (logged) return;
    logged = true;
    const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
    const st = typeof res.statusCode === 'number' ? res.statusCode : status;
    const loggedBytes =
      typeof bytes === 'number' ? bytes : Number(res.getHeader('content-length') || 0);
    const parts = [`method=${method}`, `path=${pathForLog}`, `status=${st}`, `ms=${ms.toFixed(1)}`];
    if (loggedBytes > 0) parts.push(`bytes=${loggedBytes}`);
    console.log(parts.join(' '));
  }

  res.once('finish', logDone);
  res.once('close', logDone);

  try {
    if (method !== 'GET' && method !== 'HEAD') {
      status = 405;
      res.writeHead(405, {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'none',
        Allow: 'GET, HEAD',
      });
      res.end('Method Not Allowed');
      return;
    }

    // Decode and parse URL path
    let urlPathRaw;
    try {
      const raw = (req.url || '/').split('?')[0] || '/';
      urlPathRaw = decodeURIComponent(raw);
    } catch (e) {
      console.error(e?.stack || e);
      status = 400;
      res.writeHead(400, {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'none',
      });
      res.end('Bad Request');
      return;
    }

    pathForLog = urlPathRaw;

    // Health endpoint
    if (urlPathRaw === '/health') {
      status = 200;
      const headers = {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'none',
        'Content-Length': '2',
      };
      res.writeHead(200, headers);
      if (method === 'HEAD') {
        res.end();
        bytes = 0;
      } else {
        res.end('ok');
        bytes = 2;
      }
      return;
    }

    // Normalize to a relative path (strip leading slash)
    const stripped = urlPathRaw.startsWith('/') ? urlPathRaw.slice(1) : urlPathRaw;
    const rel = normalize(stripped);
    const accept = String(req.headers['accept'] || '');

    // Build candidate path within dist
    const endsWithSlash = urlPathRaw.endsWith('/');
    const candidateRel = endsWithSlash ? normalize(rel + '/index.html') : rel;
    const candidateAbs = resolve(DIST_DIR, candidateRel);

    // Try to serve the exact file if inside dist and exists
    let result = await tryServeFile(candidateAbs, method, res);
    if (result) {
      status = result.status;
      bytes = result.bytes;
      return;
    }

    // Not served: decide fallback vs 404
    const reqHasExt = hasExtension(rel);
    const reqTargetsAsset = isAssetRequest(rel);

    if (reqTargetsAsset) {
      // Static asset missing -> 404 (no SPA fallback)
      status = 404;
      res.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'none',
        'Cache-Control': 'no-cache',
      });
      res.end('Not Found');
      bytes = 0;
      return;
    }

    const htmlEligible = !reqHasExt || wantsHtml(accept);
    if (htmlEligible) {
      // SPA fallback to index.html
      const indexAbs = resolve(DIST_DIR, 'index.html');
      result = await tryServeFile(indexAbs, method, res);
      if (result) {
        status = result.status;
        bytes = result.bytes;
        return;
      }
      // If index missing, treat as 404
      status = 404;
      res.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'none',
        'Cache-Control': 'no-cache',
      });
      res.end('Not Found');
      bytes = 0;
      return;
    }

    // Otherwise 404
    status = 404;
    res.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'none',
      'Cache-Control': 'no-cache',
    });
    res.end('Not Found');
    bytes = 0;
  } catch (err) {
    console.error(err?.stack || err);
    status = 500;
    try {
      res.writeHead(500, {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'none',
      });
      res.end('Internal Server Error');
    } catch {
      // ignore
    }
  }
});

server.on('connection', (socket) => {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
});

// Graceful shutdown with active connections
let shuttingDown = false;
function initiateShutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('shutdown=initiated');
  server.close(() => {
    console.log('shutdown=server-closed');
  });
  // Attempt graceful end of all sockets
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
  console.log(`[server] listening on http://${HOST}:${PORT}`);
});
