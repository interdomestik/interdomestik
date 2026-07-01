const SECRET_BODY_FIELD_PATTERN =
  /(["']?(?:access_token|authorization|id_token|password|refresh_token|secret|session|token)["']?\s*[:=]\s*)["']?[^"',\s}]+["']?/gi;
const BEARER_PATTERN = /\b(Bearer)\s+[-A-Za-z0-9._~+/=]+/gi;

function redactResponseBody(raw) {
  return String(raw || '')
    .replace(SECRET_BODY_FIELD_PATTERN, '$1[REDACTED]')
    .replace(BEARER_PATTERN, '$1 [REDACTED]');
}

function compactResponseUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return `${url.pathname}${url.search ? '?…' : ''}`;
  } catch {
    return String(rawUrl || '').slice(0, 120);
  }
}

function compactResponseBody(raw, maxLength = 180) {
  return redactResponseBody(raw).replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function shouldCaptureResponseBody(status, contentType) {
  return status >= 400 || contentType === 'text/x-component' || contentType === 'application/json';
}

function createMutationResponseCapture(page, baseUrl) {
  const origin = new URL(baseUrl).origin;
  const entries = [];
  const pending = [];
  const onResponse = response => {
    const task = (async () => {
      const method = response.request().method();
      if (method === 'GET' || !response.url().startsWith(origin)) return;
      const status = response.status();
      const contentType = String(response.headers?.()['content-type'] || '').split(';')[0];
      const body = shouldCaptureResponseBody(status, contentType)
        ? compactResponseBody(await response.text().catch(() => ''), 420)
        : '';
      const bodySuffix = body ? ` body=${body}` : '';
      entries.push(
        `${method} ${status} ${compactResponseUrl(response.url())} content_type=${contentType || 'unknown'}${bodySuffix}`
      );
    })();
    pending.push(task);
  };

  page.on('response', onResponse);
  return {
    async stop() {
      page.off('response', onResponse);
      await Promise.allSettled(pending);
      return entries;
    },
  };
}

module.exports = {
  compactResponseBody,
  createMutationResponseCapture,
  shouldCaptureResponseBody,
};
