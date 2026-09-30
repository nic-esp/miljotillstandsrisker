#!/usr/bin/env node
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../_site');
const basePath = '/miljotillstandsrisker';
const contentTypes = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
});

function withinDirectory(root, candidate) {
  const path = relative(root, candidate);
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

export function resolvePreviewFile(url, directory = defaultDirectory) {
  let pathname;
  try {
    // Decode before resolving. Do not let URL normalization erase traversal attempts.
    pathname = decodeURIComponent(String(url).split(/[?#]/, 1)[0]);
  } catch {
    return { status: 400 };
  }
  if (!pathname.startsWith('/') || pathname.includes('\0') || pathname.includes('\\')) return { status: 400 };
  if (pathname.split('/').some(part => part === '..')) return { status: 403 };
  if (pathname === basePath) return { status: 308, location: `${basePath}/` };
  if (pathname.startsWith(`${basePath}/`)) pathname = pathname.slice(basePath.length);

  const root = resolve(directory);
  let candidate = resolve(root, `.${pathname}`);
  if (!withinDirectory(root, candidate)) return { status: 403 };
  try {
    if (statSync(candidate).isDirectory()) candidate = join(candidate, 'index.html');
    const canonical = realpathSync(candidate);
    if (!withinDirectory(realpathSync(root), canonical)) return { status: 403 };
    const file = statSync(canonical);
    if (!file.isFile()) return { status: 404 };
    return {
      status: 200,
      path: canonical,
      size: file.size,
      contentType: contentTypes[extname(canonical).toLowerCase()] ?? 'application/octet-stream',
    };
  } catch (error) {
    return { status: error.code === 'EACCES' ? 403 : 404 };
  }
}

export function createPreviewServer(directory = defaultDirectory) {
  return createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end('Method not allowed');
      return;
    }
    const result = resolvePreviewFile(request.url, directory);
    if (result.location) {
      response.writeHead(result.status, { Location: result.location });
      response.end();
      return;
    }
    if (result.status !== 200) {
      response.writeHead(result.status, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(request.method === 'HEAD' ? undefined : 'Filen kunde inte visas.');
      return;
    }
    response.writeHead(200, { 'Content-Type': result.contentType, 'Content-Length': result.size });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    const stream = createReadStream(result.path);
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(join(defaultDirectory, 'index.html'))) {
    console.error('Ingen byggd webbplats finns. Kör npm run build först.');
    process.exitCode = 1;
  } else {
    const server = createPreviewServer();
    server.on('error', error => {
      console.error(`Förhandsvisningen kunde inte startas: ${error.message}`);
      process.exitCode = 1;
    });
    server.listen(4173, '127.0.0.1', () => {
      console.log('Förhandsvisning: http://127.0.0.1:4173/miljotillstandsrisker/');
      console.log('Kör npm run build igen efter ändringar; servern levererar filerna från _site.');
    });
  }
}
