#!/usr/bin/env node
import { createServer } from 'node:http';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { CSP, PERMISSIONS_POLICY, COOP, CORP, COEP } from './security-headers.mjs';

const HOST = '0.0.0.0';
const PORT = Number.parseInt(process.env.PORT ?? '8080', 10);
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
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
};

const ALLOWED_EXT = new Set(Object.keys(TYPES));
const ASSET_EXTS = new Set([...ALLOWED_EXT].filter((e) => e !== '.html'));
const HASH_RE = /(?:\.[A-Za-z0-9_-]{8,}\.|[.-][a-f0-9]{8,}\.)/;

// --- Security and metadata ----------------------------------------------------

const SECURITY_COEP = String(process.env.SECURITY_COEP || 'on').toLowerCase();
const HEALTHZ_EXPOSE_BUILD =
  String(process.env.HEALTHZ_EXPOSE_BUILD || 'on').toLowerCase() !== 'off';

/** Resolve version from package.json once at startup (non-blocking via import) */
let PKG_VERSION = 'unknown';
try {
  const pkgUrl = pathToFileURL(path.resolve(process.cwd(), 'package.json')).href;
  const mod = await import(pkgUrl, { assert: { type: 'json' } });
  PKG_VERSION = String((mod.default && mod.default.version) || 'unknown');
} catch {}

/** CSP is imported from shared configuration (see security-headers.mjs) */

/**
 * Detects if the request is HTTPS.
 *
 * SECURITY NOTE:
 * This relies on the 'x-forwarded-proto' header, which is only trustworthy if the proxy is trusted
 * and properly configured. Ensure your reverse proxy (e.g., Railway/NGINX/LB) is trusted and strips
 * client-supplied X-Forwarded-* headers. Otherwise, malicious clients could spoof HTTPS.
 */
function isRequestHttps(req) {
  const xfp = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  if (xfp) {
    // trust proxy: may be comma-separated
    const parts = xfp.split(',').map((s) => s.trim());
    if (parts.includes('https')) return true;
  }
  return !!(req.socket && req.socket.encrypted);
}

function applySecurityHeaders(req, res) {
  // Core security headers
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
  res.setHeader('Cross-Origin-Opener-Policy', COOP);
  res.setHeader('Cross-Origin-Resource-Policy', CORP);
  if (SECURITY_COEP !== 'off') {
    res.setHeader('Cross-Origin-Embedder-Policy', COEP);
  }
  res.setHeader('Origin-Agent-Cluster', '?1');
  res.setHeader('X-DNS-Prefetch-Control', 'off');

  // HSTS only in production over HTTPS (trust proxy x-forwarded-proto)
  if (process.env.NODE_ENV === 'production' && isRequestHttps(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
}

// -----------------------------------------------------------------------------

function getContentType(ext) {
  return TYPES[ext] || 'application/octet-stream';
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function wantsHtml(accept) {
  return typeof accept === 'string' && accept.toLowerCase().includes('text/html');
}
function hasExtension(p) {
  return /\.[^/]+$/.test(p);
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
  const candidate = path.resolve(DIST_DIR, '.' + decoded);
  if (!isInside(candidate, DIST_DIR)) return null;
  const ext = path.extname(candidate).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return null;
  return candidate;
}

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
  const candidate = path.resolve(DIST_DIR, '.' + decoded);
  return isInside(candidate, DIST_DIR);
}

function hasTraversal(rawUrl) {
  if (typeof rawUrl !== 'string') return false;
  const segPattern = /(^|[\/\\])\.\.([\/\\]|$)/;
  try {
    if (segPattern.test(rawUrl)) return true;
    if (/%(?:2e){2}/i.test(rawUrl)) return true;
    const dec = decodeURIComponent(rawUrl);
    if (segPattern.test(dec)) return true;
  } catch {
    // ignore decode errors here
  }
  return false;
}

function isAssetRequest(relPath) {
  const ext = path.extname(relPath).toLowerCase();
  return Boolean(ext && (ASSET_EXTS.has(ext) || Object.prototype.hasOwnProperty.call(TYPES, ext)));
}

async function tryServeFile(absPath, method, req, res) {
  try {
    let real = absPath;
    if (DIST_REAL) {
      real = await fsp.realpath(absPath);
      if (!isInside(real, DIST_REAL)) {
        return { served: false, status: 403 };
      }
    } else {
      const maybeReal = await fsp.realpath(absPath).catch(() => null);
      if (!maybeReal || !isInside(maybeReal, DIST_DIR)) {
        return { served: false, status: 403 };
      }
      real = maybeReal;
    }

    const s = await fsp.stat(real);
    if (!s.isFile()) return { served: false, status: 404 };

    const ext = path.extname(real).toLowerCase();
    if (ext && !ALLOWED_EXT.has(ext)) return { served: false, status: 403 };

    const base = path.basename(real);
    const etag = `W/"${s.size}-${Math.floor(s.mtimeMs)}"`;
    const inm = req.headers['if-none-match'];
    if (inm && inm === etag) {
      res.statusCode = 304;
      res.setHeader('ETag', etag);
      res.setHeader('Accept-Ranges', 'none');
      res.setHeader('Last-Modified', new Date(s.mtimeMs).toUTCString());
      res.end();
      return { served: true, status: 304, bytes: 0 };
    }
    const imsHeader = req.headers['if-modified-since'];
    if (!inm && imsHeader) {
      const imsTime = Date.parse(String(imsHeader));
      if (!Number.isNaN(imsTime)) {
        const mtimeSec = Math.floor(s.mtimeMs / 1000);
        const imsSec = Math.floor(imsTime / 1000);
        if (mtimeSec <= imsSec) {
          res.statusCode = 304;
          res.setHeader('ETag', etag);
          res.setHeader('Accept-Ranges', 'none');
          res.setHeader('Last-Modified', new Date(s.mtimeMs).toUTCString());
          res.end();
          return { served: true, status: 304, bytes: 0 };
        }
      }
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
    const onStreamError = () => stream.destroy();
    const onResError = () => stream.destroy();

    res.on('close', onClose);
    stream.on('error', onStreamError);
    res.on('error', onResError);

    try {
      await pipeline(stream, res);
    } catch {
      if (!res.headersSent) sendText(res, 500, 'Internal Server Error');
      else res.destroy();
    } finally {
      res.off('close', onClose);
      stream.off('error', onStreamError);
      res.off('error', onResError);
    }
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

async function serveHtmlEligible(urlPathRaw, method, req, res) {
  // 1) Try directory index
  const indexAbs = path.resolve(DIST_DIR, '.' + pickIndexPath(urlPathRaw));
  const rIdx = await tryServeFile(indexAbs, method, req, res);
  if (rIdx && rIdx.served) {
    return { served: true, status: rIdx.status, bytes: rIdx.bytes || 0 };
  }

  // 2) If explicit .html, try that path
  if (urlPathRaw.endsWith('.html')) {
    const htmlAbs = path.resolve(DIST_DIR, '.' + urlPathRaw);
    const rHtml = await tryServeFile(htmlAbs, method, req, res);
    if (rHtml && rHtml.served) {
      return { served: true, status: rHtml.status, bytes: rHtml.bytes || 0 };
    }
  }

  // 3) SPA fallback only for safe paths
  if (!isSafeWithinDist(urlPathRaw)) {
    return { served: false, status: 403, bytes: 0 };
  }
  const spaAbs = path.resolve(DIST_DIR, 'index.html');
  const rFb = await tryServeFile(spaAbs, method, req, res);
  if (rFb && rFb.served) {
    return { served: true, status: rFb.status, bytes: rFb.bytes || 0 };
  }

  return { served: false, status: 404, bytes: 0 };
}

const sockets = new Set();

const server = createServer(async (req, res) => {
  const start = process.hrtime.bigint();
  let status = 500;
  let bytes;
  let pathForLog = '-';
  const method = (req.method || 'GET').toUpperCase();

  // Apply global security headers for all responses, before any early return
  applySecurityHeaders(req, res);

  let logged = false;
  const logDone = () => {
    if (logged) return;
    logged = true;
    const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
    const st = typeof res.statusCode === 'number' ? res.statusCode : status;
    const loggedBytes =
      typeof bytes === 'number' ? bytes : Number(res.getHeader('content-length') || 0);
    const parts = [`method=${method}`, `path=${pathForLog}`, `status=${st}`, `ms=${ms.toFixed(1)}`];
    if (loggedBytes > 0) parts.push(`bytes=${loggedBytes}`);
    console.log(parts.join(' '));
  };

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

    let urlPathRaw;
    try {
      const u = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      urlPathRaw = u.pathname || '/';
      decodeURIComponent(urlPathRaw);
    } catch (e) {
      console.error(e?.stack || e);
      status = 400;
      sendText(res, 400, 'Bad Request');
      return;
    }

    if (urlPathRaw.includes('\0')) {
      status = 400;
      sendText(res, 400, 'Bad Request');
      return;
    }

    pathForLog = urlPathRaw;

    const rawUrl = req.url || '/';
    if (hasTraversal(rawUrl)) {
      status = 403;
      sendText(res, 403, 'Forbidden', { 'Cache-Control': 'no-cache' });
      bytes = 0;
      return;
    }

    // Health endpoint: JSON body for GET; headers only for HEAD
    if (urlPathRaw === '/healthz') {
      status = 200;
      const bodyObj = {
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        version: HEALTHZ_EXPOSE_BUILD ? PKG_VERSION : 'redacted',
        commitSha: HEALTHZ_EXPOSE_BUILD ? process.env.COMMIT_SHA || 'unknown' : 'redacted',
      };
      const body = JSON.stringify(bodyObj);
      const baseHeaders = {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Accept-Ranges': 'none',
      };
      if (method === 'HEAD') {
        res.writeHead(200, baseHeaders);
        res.end();
        bytes = 0;
      } else {
        res.writeHead(200, {
          ...baseHeaders,
          'Content-Length': String(Buffer.byteLength(body)),
        });
        res.end(body);
        bytes = Buffer.byteLength(body);
      }
      return;
    }

    // Legacy plain-text health (kept for back-compat, optional)
    if (urlPathRaw === '/health') {
      status = 200;
      const body = 'ok';
      const headers = {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'none',
        'Content-Length': String(Buffer.byteLength(body)),
      };
      res.writeHead(200, headers);
      if (method === 'HEAD') {
        res.end();
        bytes = 0;
      } else {
        res.end(body);
        bytes = Buffer.byteLength(body);
      }
      return;
    }

    const endsWithSlash = urlPathRaw.endsWith('/');
    const candidatePathname = endsWithSlash ? urlPathRaw + 'index.html' : urlPathRaw;

    let result;
    const resolvedCandidate = resolveStaticPath(candidatePathname);
    if (resolvedCandidate) {
      result = await tryServeFile(resolvedCandidate, method, req, res);
      if (result && result.served) {
        status = result.status;
        bytes = result.bytes;
        return;
      }
    }

    const reqHasExt = hasExtension(urlPathRaw);
    const reqTargetsAsset = isAssetRequest(urlPathRaw);

    if (reqTargetsAsset) {
      status = 404;
      sendText(res, 404, 'Not Found', { 'Cache-Control': 'no-cache' });
      bytes = 0;
      return;
    }

    const htmlEligible = !reqHasExt || wantsHtml(req.headers['accept'] || '');
    if (htmlEligible) {
      const rHtml = await serveHtmlEligible(urlPathRaw, method, req, res);
      if (rHtml && rHtml.served) {
        status = rHtml.status;
        bytes = rHtml.bytes;
        return;
      }
      status = 404;
      sendText(res, 404, 'Not Found', { 'Cache-Control': 'no-cache' });
      bytes = 0;
      return;
    }

    status = 404;
    sendText(res, 404, 'Not Found', { 'Cache-Control': 'no-cache' });
    bytes = 0;
  } catch (err) {
    console.error(err?.stack || err);
    status = 500;
    try {
      sendText(res, 500, 'Internal Server Error');
    } catch {
      // ignore
    }
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
  server.close(() => {
    console.log('shutdown=server-closed');
  });
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

console.log(`startup host=${HOST} port=${PORT} node=${process.version}`);
if (SECURITY_COEP === 'off') {
  console.warn('security.coep=off Cross-Origin-Embedder-Policy disabled via SECURITY_COEP=off');
}
if (!HEALTHZ_EXPOSE_BUILD) {
  console.warn(
    'healthz.expose_build=off version/commitSha redacted on /healthz (HEALTHZ_EXPOSE_BUILD=off)',
  );
}
server.listen(PORT, HOST, () => {
  console.log(`Static server listening on http://${HOST}:${PORT} serving ${DIST_DIR}`);
});
