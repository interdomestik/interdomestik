/** Tiny stored ZIP writer: real local headers, central directory and EOCD. */
export function zipFixture(names: readonly string[], extraBytes = 0, comment = ''): Uint8Array {
  const encoder = new TextEncoder();
  const entries = names.map(name => encoder.encode(name));
  const localSize = entries.reduce((sum, name) => sum + 30 + name.length + extraBytes, 0);
  const directorySize = entries.reduce((sum, name) => sum + 46 + name.length, 0);
  const commentBytes = encoder.encode(comment);
  const bytes = new Uint8Array(localSize + directorySize + 22 + commentBytes.length);
  const view = new DataView(bytes.buffer);
  let local = 0;
  let central = localSize;
  for (const name of entries) {
    view.setUint32(local, 0x04034b50, true);
    view.setUint16(local + 4, 20, true);
    view.setUint16(local + 26, name.length, true);
    view.setUint16(local + 28, extraBytes, true);
    bytes.set(name, local + 30);
    view.setUint32(central, 0x02014b50, true);
    view.setUint16(central + 4, 20, true);
    view.setUint16(central + 6, 20, true);
    view.setUint16(central + 28, name.length, true);
    view.setUint32(central + 42, local, true);
    bytes.set(name, central + 46);
    local += 30 + name.length + extraBytes;
    central += 46 + name.length;
  }
  view.setUint32(central, 0x06054b50, true);
  view.setUint16(central + 8, entries.length, true);
  view.setUint16(central + 10, entries.length, true);
  view.setUint32(central + 12, directorySize, true);
  view.setUint32(central + 16, localSize, true);
  view.setUint16(central + 20, commentBytes.length, true);
  bytes.set(commentBytes, central + 22);
  return bytes;
}

export function webmFixture(docType = 'webm'): Uint8Array {
  const text = new TextEncoder().encode(docType);
  // EBML header containing EBMLVersion=1 and DocType.
  return new Uint8Array([
    0x1a,
    0x45,
    0xdf,
    0xa3,
    0x80 | (7 + text.length),
    0x42,
    0x86,
    0x81,
    1,
    0x42,
    0x82,
    0x80 | text.length,
    ...text,
  ]);
}
