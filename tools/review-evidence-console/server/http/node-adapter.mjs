function requestUrl(request) {
  const host = request.headers.host || '127.0.0.1';
  return `http://${host}${request.url || '/'}`;
}

function toFetchRequest(request) {
  const method = request.method || 'GET';
  const init = { method, headers: request.headers };
  if (!['GET', 'HEAD'].includes(method)) {
    init.body = request;
    init.duplex = 'half';
  }
  return new Request(requestUrl(request), init);
}

export async function handleNodePortalRequest(request, response, handler) {
  const result = await handler(toFetchRequest(request));
  const headers = Object.fromEntries(result.headers.entries());
  const body = Buffer.from(await result.arrayBuffer());
  response.writeHead(result.status, { ...headers, 'content-length': body.length });
  response.end(request.method === 'HEAD' ? undefined : body);
}
