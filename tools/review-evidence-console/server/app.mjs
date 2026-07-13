import { createServer } from 'node:http';
import { readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { handleNodePortalRequest } from './http/node-adapter.mjs';
import { createEnvironmentPortalHandler } from './runtime.mjs';

export { createFixtureService } from './fixture-service.mjs';
export { parseAccountRegistry } from './auth/account-registry.mjs';
export { derivePasswordKey, verifyPassword } from './auth/password.mjs';
export { createSessionToken, verifySessionToken } from './auth/session-token.mjs';
export { clearSessionCookie, readSessionCookie, sessionCookie } from './auth/cookies.mjs';
export { hasValidMutationOrigin, requestOrigin } from './auth/origin.mjs';
export { createPortalHandler } from './portal-handler.mjs';

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
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; connect-src 'self'",
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

export function createConsoleServer({
  publicRoot = defaultPublicRoot,
  portalHandler = createEnvironmentPortalHandler(),
} = {}) {
  let publicIndexPromise;
  const getPublicIndex = () => (publicIndexPromise ??= buildPublicIndex(publicRoot));

  return createServer(async (request, response) => {
    const requestPath = (request.url ?? '').split('?')[0];
    if (requestPath === '/api' || requestPath.startsWith('/api/')) {
      return handleNodePortalRequest(request, response, portalHandler);
    }
    if (!['GET', 'HEAD'].includes(request.method)) return sendError(response, request.method, 405);
    const pathname = (request.url ?? '/').split('?')[0];
    let decodedPath;
    try {
      decodedPath = decodeURIComponent(pathname);
    } catch {
      return sendError(response, request.method, 400);
    }
    const publicPath = decodedPath === '/' ? '/index.html' : decodedPath;
    if (publicPath.startsWith('/data/')) return sendError(response, request.method, 404);
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
