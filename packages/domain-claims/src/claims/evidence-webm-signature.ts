type ElementNumber = { value: number; next: number };
type Element = { id: number; start: number; end: number };

function readVint(bytes: Uint8Array, offset: number, isId = false): ElementNumber | null {
  const first = bytes[offset];
  if (!first) return null;
  const length = Math.clz32(first) - 23;
  if (length > (isId ? 4 : 8) || offset + length > bytes.length) return null;
  let value = isId ? first : first & (0xff >> length);
  for (let index = 1; index < length; index++) value = value * 256 + bytes[offset + index];
  if (!Number.isSafeInteger(value) || (!isId && value === 2 ** (7 * length) - 1)) return null;
  return { value, next: offset + length };
}

function readElement(bytes: Uint8Array, offset: number, end: number): Element | null {
  const id = readVint(bytes, offset, true);
  if (!id) return null;
  const size = readVint(bytes, id.next);
  if (!size || size.next + size.value > end) return null;
  return { id: id.value, start: size.next, end: size.next + size.value };
}

/** Identify WebM inside the EBML header; track types require inspection beyond a prefix. */
export function webmSignatureMatches(bytes: Uint8Array): boolean {
  const id = readVint(bytes, 0, true);
  if (id?.value !== 0x1a45dfa3) return false;
  const size = readVint(bytes, id.next);
  if (!size || size.next + size.value > bytes.length) return false;
  const end = size.next + size.value;
  let offset = size.next;
  let found = false;
  while (offset < end) {
    const child = readElement(bytes, offset, end);
    if (!child) return false;
    if (child.id === 0x4282) {
      const docType = new TextDecoder().decode(bytes.subarray(child.start, child.end));
      if (found || child.end - child.start !== 4 || docType !== 'webm') return false;
      found = true;
    }
    offset = child.end;
  }
  return found;
}
