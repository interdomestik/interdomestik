async function readBoundedText(request, maxBytes) {
  if (!request.body) return { ok: true, value: '' };
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        return { ok: false, status: 413, code: 'body_too_large' };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return { ok: true, value: Buffer.concat(chunks, length).toString('utf8') };
}

export async function readJsonBody(request, maxBytes = 8192) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return { ok: false, status: 415, code: 'unsupported_media_type' };
  }
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, status: 413, code: 'body_too_large' };
  }
  const body = await readBoundedText(request, maxBytes);
  if (!body.ok) return body;
  try {
    const value = JSON.parse(body.value);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ok: true, value }
      : { ok: false, status: 400, code: 'invalid_request' };
  } catch {
    return { ok: false, status: 400, code: 'invalid_request' };
  }
}
