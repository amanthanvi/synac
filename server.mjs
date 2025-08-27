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

const HASH_RE = /\.[A-Za-z0-9_-]{8,}\./;

const ALLOWED_EXT = new Set([
  '.html',
  '.css',
  '.js',
  '.mjs',
  '.map',
  '.json',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.webp',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.wasm',
  '.txt',
  '.xml',
  '.webmanifest',
]);

function resolveStaticPath(urlPath) {
  if (typeof urlPath !== 'string') return null;
  if (urlPath.includes('\0')) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (!decoded.startsWith('/')) decoded = '/' + decoded;
  const candidate = resolve(DIST_DIR, '.' + decoded);
  if (!isInside(candidate, DIST_DIR)) return null;
  const ext = extname(candidate).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return null;
  return candidate;
}

// For SPA fallback eligibility: ensure URL maps within dist (no traversal), but do not enforce extension allowlist.
function isSafeWithinDist(urlPath) {
  if (typeof urlPath !== 'string') return false;
  if (urlPath.includes('\0')) return false;
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return false;
  }
  if (!decoded.startsWith('/')) decoded = '/' + decoded;
  const candidate = resolve(DIST_DIR, '.' + decoded);
  return isInside(candidate, DIST_DIR);
}

// Detect traversal attempts from the raw URL (before WHATWG URL normalization)
// Checks both raw and percent-decoded forms for '..' path segments.
function hasTraversal(rawUrl) {
  if (typeof rawUrl !== 'string') return false;
  const segPattern = /(^|[\/\\])\.\.([\/\\]|$)/;
  try {
    if (segPattern.test(rawUrl)) return true;
    if (/%(?:2e){2}/i.test(rawUrl)) return true; // %2e%2e
    const dec = decodeURIComponent(rawUrl);
    if (segPattern.test(dec)) return true;
  } catch {
    // ignore decode errors here; handled elsewhere
  }
  return false;
}

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
  // Canonicalize first; only proceed if inside allowed root
  let real;
  try {
    real = await realpath(absPath);
  } catch {
    return false; // path does not exist or cannot be resolved
  }
  if (!isInside(real, DIST_REAL)) {
    // Symlink or traversal attempt: deny
    return false;
  }

  // Stat the canonical path (no I/O on untrusted/non-canonical paths)
  let s;
  try {
    s = await stat(real);
    if (!s.isFile()) return false;
  } catch {
    return false; // file does not exist
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

    // Parse URL path (prefer URL API) and validate decoding for 400 on bad input
    let urlPathRaw;
    try {
      const u = new URL(req.url || '/', 'http://localhost');
      urlPathRaw = u.pathname || '/';
      // Validate decoding without using decoded value for filesystem yet
      decodeURIComponent(urlPathRaw);
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

    // Block traversal attempts early (403), do not allow SPA fallback
    {
      const rawUrl = req.url || '/';
      if (hasTraversal(rawUrl)) {
        status = 403;
        res.writeHead(403, {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
          'Accept-Ranges': 'none',
          'Cache-Control': 'no-cache',
        });
        res.end('Forbidden');
        bytes = 0;
        return;
      }
    }

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

    const accept = String(req.headers['accept'] || '');
    const endsWithSlash = urlPathRaw.endsWith('/');
    const candidatePathname = endsWithSlash ? urlPathRaw + 'index.html' : urlPathRaw;

    // Resolve candidate safely before any fs.* calls
    let result;
    const resolvedCandidate = resolveStaticPath(candidatePathname);
    if (resolvedCandidate) {
      result = await tryServeFile(resolvedCandidate, method, res);
      if (result) {
        status = result.status;
        bytes = result.bytes;
        return;
      }
    }

    // Not served: decide fallback vs 404 with SPA restrictions
    const reqHasExt = hasExtension(urlPathRaw);
    const reqTargetsAsset = isAssetRequest(urlPathRaw);

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
      // Only allow SPA fallback if the request path itself is safe within dist (no traversal)
      if (!isSafeWithinDist(urlPathRaw)) {
        status = 403;
        res.writeHead(403, {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
          'Accept-Ranges': 'none',
          'Cache-Control': 'no-cache',
        });
        res.end('Forbidden');
        bytes = 0;
        return;
      }

      // SPA fallback to index.html (known safe path, not derived from URL)
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
