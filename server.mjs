#!/usr/bin/env node
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';

const PORT = Number(process.env.PORT || 3000);
const DIST_DIR = path.resolve(process.cwd(), 'dist');

export const ALLOWED_EXT = new Set([
  '.html',
  '.css',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.map',
  '.ico',
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
  '.gif',
  '.webp',
  '.avif',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.txt',
  '.xml',
  '.webmanifest',
  '.wasm',
]);

export const HASH_RE = /[.-][a-f0-9]{8,}\./i;

const MIME = {
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

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}

function safeDecodePath(p) {
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
}

export function resolveStaticPath(urlPathname) {
  let p = urlPathname || '/';
  if (!p.startsWith('/')) p = '/' + p;
  p = safeDecodePath(p);
  const normalized = path.posix.normalize(p);
  if (normalized.includes('\0')) return { path: null, forbidden: true };
  const fsPath = path.resolve(DIST_DIR, '.' + normalized);
  if (!fsPath.startsWith(DIST_DIR + path.sep) && fsPath !== DIST_DIR) {
    return { path: null, forbidden: true };
  }
  const ext = path.extname(fsPath).toLowerCase();
  if (ext && !ALLOWED_EXT.has(ext)) {
    return { path: null, forbidden: false };
  }
  return { path: fsPath, forbidden: false };
}

export async function tryServeFile(fsPath, req, res) {
  try {
    const stat = await fsp.stat(fsPath);
    if (!stat.isFile()) return false;
    const ext = path.extname(fsPath).toLowerCase();
    if (ext && !ALLOWED_EXT.has(ext)) return false;

    const isHtml = ext === '.html';
    const base = path.basename(fsPath);
    const hashed = HASH_RE.test(base);

    const etag = `W/"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
    const inm = req.headers['if-none-match'];
    if (inm && inm === etag) {
      res.statusCode = 304;
      res.setHeader('ETag', etag);
      res.end();
      return true;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', contentTypeFor(fsPath));
    res.setHeader('ETag', etag);
    if (isHtml) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else {
      if (hashed) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    }

    if (req.method === 'HEAD') {
      res.end();
      return true;
    }

    const stream = fs.createReadStream(fsPath);
    stream.on('error', (err) => {
      console.error('stream error', err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      } else {
        res.destroy();
      }
    });
    stream.pipe(res);
    return true;
  } catch (err) {
    if (err && err.code === 'ENOENT') return false;
    console.error('tryServeFile error', err);
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  const start = Date.now();
  const urlObj = new URL(req.url, 'http://localhost');
  const rawPath = urlObj.pathname;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.end('Method Not Allowed');
    console.log(`${req.method} ${rawPath} -> 405 (${Date.now() - start}ms)`);
    return;
  }

  const ext = path.extname(rawPath).toLowerCase();
  const resolved = resolveStaticPath(rawPath);
  if (resolved.forbidden) {
    res.statusCode = 403;
    res.end('Forbidden');
    console.log(`${req.method} ${rawPath} -> 403 (${Date.now() - start}ms)`);
    return;
  }

  if (ext) {
    if (resolved.path && ALLOWED_EXT.has(ext) && (await tryServeFile(resolved.path, req, res))) {
      console.log(`${req.method} ${rawPath} -> 200 (${Date.now() - start}ms)`);
      return;
    }
    res.statusCode = 404;
    res.end('Not Found');
    console.log(`${req.method} ${rawPath} -> 404 (${Date.now() - start}ms)`);
    return;
  }

  {
    const idxPathname = rawPath.endsWith('/') ? rawPath + 'index.html' : rawPath + '/index.html';
    const idxResolved = resolveStaticPath(idxPathname);
    if (idxResolved.forbidden) {
      res.statusCode = 403;
      res.end('Forbidden');
      console.log(`${req.method} ${rawPath} -> 403 (${Date.now() - start}ms)`);
      return;
    }
    if (idxResolved.path && (await tryServeFile(idxResolved.path, req, res))) {
      console.log(`${req.method} ${rawPath} -> 200 (index) (${Date.now() - start}ms)`);
      return;
    }
  }

  {
    const fbResolved = resolveStaticPath('/index.html');
    if (fbResolved.path && (await tryServeFile(fbResolved.path, req, res))) {
      console.log(`${req.method} ${rawPath} -> 200 (spa) (${Date.now() - start}ms)`);
      return;
    }
  }

  res.statusCode = 404;
  res.end('Not Found');
  console.log(`${req.method} ${rawPath} -> 404 (${Date.now() - start}ms)`);
});

server.listen(PORT, () => {
  console.log(`Static server listening on http://0.0.0.0:${PORT} serving ${DIST_DIR}`);
});
