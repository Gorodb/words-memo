// Production server for the built site (dist/), for cPanel "Setup Node.js App"
// (Phusion Passenger) or any Node 22+ host. No dependencies: Passenger loads
// this file with require(), so it is CommonJS.
//
// - Files from dist/ with the right types; hashed assets are cached for a
//   year, index.html is always revalidated (new deploys show up at once).
// - Every other path (/sets/…, /s/ABCD-EFGH) gets index.html: the app's
//   router handles it.
// - gzip for text when the browser accepts it.
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, 'dist');
const INDEX = path.join(ROOT, 'index.html');
// Passenger sets PORT (or handles listen() itself); 3000 is for local runs.
const PORT = Number(process.env.PORT) || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const COMPRESSIBLE = /^(text\/|application\/(json|manifest\+json)|image\/svg\+xml)/;

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
};

if (!fs.existsSync(INDEX)) {
  console.error(`Missing ${INDEX}. Run "npm run build" before starting the server.`);
}

/** The file for a URL path inside dist/, or null (outside dist/ or missing). */
function resolveFile(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const file = path.normalize(path.join(ROOT, decoded));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    return null; // ../ tricks
  }
  try {
    return fs.statSync(file).isFile() ? file : null;
  } catch {
    return null;
  }
}

function send(req, res, file, status = 200) {
  const ext = path.extname(file).toLowerCase();
  const type = TYPES[ext] || 'application/octet-stream';
  const hashed = file.startsWith(path.join(ROOT, 'assets') + path.sep);
  const headers = {
    ...SECURITY_HEADERS,
    'Content-Type': type,
    'Cache-Control': hashed
      ? 'public, max-age=31536000, immutable'
      : ext === '.html'
      ? 'no-cache'
      : 'public, max-age=3600',
    Vary: 'Accept-Encoding',
  };
  const gzip =
    COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (gzip) {
    headers['Content-Encoding'] = 'gzip';
  } else {
    headers['Content-Length'] = fs.statSync(file).size;
  }
  res.writeHead(status, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = fs.createReadStream(file);
  stream.on('error', () => res.destroy());
  (gzip ? stream.pipe(zlib.createGzip()) : stream).pipe(res);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }
  const urlPath = new URL(req.url || '/', 'http://localhost').pathname;
  if (urlPath === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }
  const file = resolveFile(urlPath);
  if (file) {
    send(req, res, file);
    return;
  }
  // A missing asset is a real 404 (an old cached page asking for an old file).
  if (urlPath.startsWith('/assets/') || !fs.existsSync(INDEX)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  send(req, res, INDEX);
});

server.listen(PORT, () => {
  console.log(`Words web app on http://localhost:${PORT}`);
});
