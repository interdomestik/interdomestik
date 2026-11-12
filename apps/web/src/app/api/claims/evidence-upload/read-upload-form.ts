// Leave room for multipart framing while keeping this legacy route below Vercel's body limit.
export const MAX_DIRECT_FILE_BYTES = 4 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_DIRECT_FILE_BYTES + 64 * 1024;

export async function readUploadForm(request: Request): Promise<FormData | 'too-large' | null> {
  const declaredLength = Number(request.headers?.get('content-length'));
  if (declaredLength > MAX_BODY_BYTES) return 'too-large';
  // Native requests are streamed and bounded before multipart parsing. Test adapters may expose
  // only formData(); their parsed file still receives the same 4 MB validation.
  if (!request.body) return request.formData().catch(() => null);
  const reader = request.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return 'too-large';
      }
      chunks.push(new Uint8Array(chunk.value));
    }
    return await new Response(new Blob(chunks), { headers: request.headers }).formData();
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
