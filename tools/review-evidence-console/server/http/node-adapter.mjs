import { notFoundResponse } from './responses.mjs';

const API_PATH = /^\/api(?:\/[a-z0-9_-]{1,100}){0,3}$/u;

function requestPath(request) {
  if (typeof request.url !== 'string' || request.url.length > 512) return null;
  const pathname = request.url.split('?')[0];
  return API_PATH.test(pathname) ? pathname : null;
}

function serverUrl(request) {
  const port = request.socket?.localPort;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return null;
  const host = request.headers?.host?.toLowerCase();
  if (host === `localhost:${port}`) return `http://localhost:${port}/api`;
  if (host === `127.0.0.1:${port}`) return `http://127.0.0.1:${port}/api`;
  if (host === `[::1]:${port}`) return `http://[::1]:${port}/api`;
  return null;
}

function toFetchRequest(request) {
  const url = serverUrl(request);
  if (!url) return null;
  const method = request.method || 'GET';
  const init = { method, headers: request.headers };
  if (!['GET', 'HEAD'].includes(method)) {
    init.body = request;
    init.duplex = 'half';
  }
  return new Request(url, init);
}

export async function handleNodePortalRequest(request, response, handler) {
  const pathname = requestPath(request);
  const fetchRequest = pathname ? toFetchRequest(request) : null;
  const result = fetchRequest ? await handler(fetchRequest, pathname) : notFoundResponse();
  const headers = Object.fromEntries(result.headers.entries());
  const body = Buffer.from(await result.arrayBuffer());
  response.writeHead(result.status, { ...headers, 'content-length': body.length });
  response.end(request.method === 'HEAD' ? undefined : body);
}
