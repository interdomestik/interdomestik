import { createServer } from 'node:http';
import { readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
});

export const SECURITY_HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-origin',
  'content-security-policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; connect-src 'none'",
});

const defaultPublicRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');

export function resolvePublicFile(pathname, publicRoot = defaultPublicRoot) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return { code: 400 };
  }
  const root = path.resolve(publicRoot);
  const filePath = path.resolve(root, `.${decodedPath === '/' ? '/index.html' : decodedPath}`);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) return { code: 403 };
  return { filePath };
}

export function createConsoleServer({ publicRoot = defaultPublicRoot } = {}) {
  let publicIndexPromise;
  const getPublicIndex = () =>
    (publicIndexPromise ??= buildPublicIndex(publicRoot));

  return createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) return sendError(response, request.method, 405);
    const pathname = request.url.split('?')[0];
    let decodedPath;
    try {
      decodedPath = decodeURIComponent(pathname);
    } catch {
      return sendError(response, request.method, 400);
    }
    const publicPath = decodedPath === '/' ? '/index.html' : decodedPath;
    const mime = MIME_TYPES[path.extname(publicPath).toLowerCase()];
    if (!mime) return sendError(response, request.method, 415);
    try {
      const filePath = (await getPublicIndex()).get(publicPath);
      if (!filePath) return sendError(response, request.method, 404);
      const body = await readFile(filePath);
      response.writeHead(200, {
        ...SECURITY_HEADERS,
        'content-type': mime,
        'content-length': body.length,
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
        sendError(response, request.method, 404);
      } else {
        sendError(response, request.method, 403);
      }
    }
  });
}

async function buildPublicIndex(publicRoot) {
  const root = await realpath(publicRoot);
  const files = new Map();
  async function visit(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(entryPath, relative);
      else if (entry.isFile()) files.set(`/${relative}`, entryPath);
    }
  }
  await visit(root);
  return files;
}

function sendError(response, method, code) {
  const headers = { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8' };
  if (code === 405) headers.allow = 'GET, HEAD';
  response.writeHead(code, headers);
  response.end(method === 'HEAD' ? undefined : `${code}\n`);
}
