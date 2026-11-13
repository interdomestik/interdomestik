export const EVIDENCE_TAIL_BYTES = 64 * 1024;
export type EvidenceObjectTail = { bytes: Uint8Array; offset: number };

function firstOfficePartMatches(
  signature: 'docx' | 'xlsx',
  prefix: Uint8Array,
  directoryStart: number
): boolean {
  const view = new DataView(prefix.buffer, prefix.byteOffset, prefix.byteLength);
  if (view.getUint32(0, true) !== 0x04034b50 || (view.getUint16(6, true) & 1) !== 0) return false;
  const length = view.getUint16(26, true);
  const headerEnd = 30 + length + view.getUint16(28, true);
  if (length === 0 || 30 + length > prefix.length || headerEnd > directoryStart) return false;
  const name = new TextDecoder().decode(prefix.subarray(30, 30 + length));
  return (
    name === '[Content_Types].xml' ||
    name === '_rels/.rels' ||
    name.startsWith('docProps/') ||
    name.startsWith(signature === 'docx' ? 'word/' : 'xl/')
  );
}

function findDirectoryEnd(view: DataView): number {
  for (let end = view.byteLength - 22; end >= 0; end--) {
    if (
      view.getUint32(end, true) === 0x06054b50 &&
      end + 22 + view.getUint16(end + 20, true) === view.byteLength
    )
      return end;
  }
  return -1;
}

function directoryNames(
  view: DataView,
  start: number,
  end: number,
  absoluteStart: number
): string[] | null {
  const names: string[] = [];
  let offset = start;
  while (offset + 46 <= end) {
    if (view.getUint32(offset, true) !== 0x02014b50) return null;
    // Refuse encrypted or multi-disk entries and invalid local-header offsets.
    if (
      (view.getUint16(offset + 8, true) & 1) !== 0 ||
      view.getUint16(offset + 34, true) !== 0 ||
      view.getUint32(offset + 42, true) >= absoluteStart
    )
      return null;
    const length = view.getUint16(offset + 28, true);
    const next =
      offset + 46 + length + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    if (length === 0 || next > end) return null;
    names.push(
      new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset + offset + 46, length))
    );
    offset = next;
  }
  return offset === end ? names : null;
}

function directoryStart(view: DataView, end: number, tailOffset: number): number | null {
  const start = view.getUint32(end + 16, true) - tailOffset;
  if (
    view.getUint32(end + 4, true) !== 0 ||
    view.getUint16(end + 8, true) !== view.getUint16(end + 10, true) ||
    start < 0 ||
    start + view.getUint32(end + 12, true) !== end
  )
    return null;
  return start;
}

/** Bounded ZIP directory inspection; no decompression or XML/content validation. */
export function officePackageMatches(
  signature: 'docx' | 'xlsx',
  prefix: Uint8Array,
  tail?: EvidenceObjectTail
): boolean {
  if (!tail || prefix.length < 30 || tail.bytes.length > EVIDENCE_TAIL_BYTES) return false;
  const view = new DataView(tail.bytes.buffer, tail.bytes.byteOffset, tail.bytes.byteLength);
  const end = findDirectoryEnd(view);
  if (end < 0 || !Number.isSafeInteger(tail.offset) || tail.offset < 0) return false;
  const start = directoryStart(view, end, tail.offset);
  if (start === null) return false;
  if (!firstOfficePartMatches(signature, prefix, tail.offset + start)) return false;
  const names = directoryNames(view, start, end, tail.offset + start);
  const required = signature === 'docx' ? 'word/document.xml' : 'xl/workbook.xml';
  return (
    names !== null &&
    names.length === view.getUint16(end + 10, true) &&
    names.includes('[Content_Types].xml') &&
    names.includes(required)
  );
}
