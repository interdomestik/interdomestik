export async function readJsonBody(request, maxBytes = 8192) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return { ok: false, status: 415, code: 'unsupported_media_type' };
  }
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, status: 413, code: 'body_too_large' };
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    return { ok: false, status: 413, code: 'body_too_large' };
  }
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ok: true, value }
      : { ok: false, status: 400, code: 'invalid_request' };
  } catch {
    return { ok: false, status: 400, code: 'invalid_request' };
  }
}
