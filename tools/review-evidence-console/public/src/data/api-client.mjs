const ERROR_CODES = Object.freeze({
  401: 'session_expired',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  429: 'rate_limited',
});

export class PortalApiError extends Error {
  constructor(status, code = ERROR_CODES[status] ?? 'unavailable') {
    super(code);
    this.name = 'PortalApiError';
    this.status = status;
    this.code = code;
  }
}

export function createApiClient({ fetchImpl = globalThis.fetch } = {}) {
  async function request(path, { method = 'GET', body } = {}) {
    let response;
    try {
      response = await fetchImpl(path, {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new PortalApiError(0);
    }
    if (!response.ok) throw new PortalApiError(response.status);
    if (response.status === 204) return undefined;
    try {
      return await response.json();
    } catch {
      throw new PortalApiError(502);
    }
  }

  return Object.freeze({
    session: () => request('/api/session'),
    login: credentials =>
      request('/api/session/login', {
        method: 'POST',
        body: { username: credentials.username, password: credentials.password },
      }),
    logout: () => request('/api/session/logout', { method: 'POST' }),
    listAssignments: () => request('/api/assignments'),
    loadAssignment: id => {
      if (typeof id !== 'string' || !/^[a-z0-9_-]{3,100}$/u.test(id)) {
        throw new PortalApiError(404);
      }
      return request(`/api/assignments/${encodeURIComponent(id)}`);
    },
    submitReceipt: judgments => request('/api/receipts', { method: 'POST', body: judgments }),
    correctReceipt: correction =>
      request('/api/receipts/correct', { method: 'POST', body: correction }),
    verifyReceipt: receipt =>
      request('/api/receipts/verify', { method: 'POST', body: { receipt } }),
  });
}
