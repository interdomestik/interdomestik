type EvidenceCategory = 'document' | 'image' | 'audio' | 'video';
type Signature =
  | 'pdf'
  | 'jpeg'
  | 'png'
  | 'heic'
  | 'heif'
  | 'webp'
  | 'ole'
  | 'zip'
  | 'mp3'
  | 'm4a'
  | 'wav'
  | 'mp4'
  | 'mov'
  | 'webm'
  | 'ogg';

export type EvidenceFormat = Readonly<{
  extensions: readonly string[];
  mimeType: string;
  category: EvidenceCategory;
  maxBytes: number;
  signature: Signature;
}>;

const MB = 1024 * 1024;
function format(
  extensions: string[],
  mimeType: string,
  category: EvidenceCategory,
  signature: Signature
): EvidenceFormat {
  return {
    extensions,
    mimeType,
    category,
    signature,
    maxBytes: (category === 'video' ? 50 : 10) * MB,
  };
}

export const EVIDENCE_FORMATS: readonly EvidenceFormat[] = [
  format(['pdf'], 'application/pdf', 'document', 'pdf'),
  format(['jpg', 'jpeg', 'jfif'], 'image/jpeg', 'image', 'jpeg'),
  format(['png'], 'image/png', 'image', 'png'),
  format(['heic'], 'image/heic', 'image', 'heic'),
  format(['heif'], 'image/heif', 'image', 'heif'),
  format(['webp'], 'image/webp', 'image', 'webp'),
  format(['doc'], 'application/msword', 'document', 'ole'),
  format(
    ['docx'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'document',
    'zip'
  ),
  format(['xls'], 'application/vnd.ms-excel', 'document', 'ole'),
  format(
    ['xlsx'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'document',
    'zip'
  ),
  format(['mp3'], 'audio/mpeg', 'audio', 'mp3'),
  format(['m4a'], 'audio/mp4', 'audio', 'm4a'),
  format(['wav'], 'audio/wav', 'audio', 'wav'),
  format(['mp4'], 'video/mp4', 'video', 'mp4'),
  format(['mov'], 'video/quicktime', 'video', 'mov'),
  // Recorder containers require an explicit audio MIME; never infer WebM video as audio.
  format(['webm'], 'audio/webm', 'audio', 'webm'),
  format(['ogg'], 'audio/ogg', 'audio', 'ogg'),
];

export const EVIDENCE_FORMAT_LABEL =
  'PDF, JPEG (JPG/JPEG/JFIF), PNG, HEIC/HEIF, WEBP, DOC/DOCX, XLS/XLSX, MP3/M4A/WAV, MP4/MOV';
export const EVIDENCE_FILE_ACCEPT = [
  ...new Set(
    EVIDENCE_FORMATS.flatMap(entry => [
      ...(['webm', 'ogg'].includes(entry.signature) ? [] : entry.extensions.map(ext => `.${ext}`)),
      entry.mimeType,
    ])
  ),
].join(',');
export const EVIDENCE_PREFIX_BYTES = 256;

export function resolveEvidenceFormat(fileName: string, mimeType = ''): EvidenceFormat | null {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return null;
  const extension = fileName.slice(dot + 1).toLowerCase();
  const normalizedMime = mimeType.split(';')[0].trim().toLowerCase();
  if (extension === 'mp4' && normalizedMime === 'audio/mp4') {
    return EVIDENCE_FORMATS.find(entry => entry.signature === 'm4a') ?? null;
  }
  const entry = EVIDENCE_FORMATS.find(candidate => candidate.extensions.includes(extension));
  if (!entry) return null;
  if (['webm', 'ogg'].includes(entry.signature) && entry.mimeType !== normalizedMime) return null;
  return entry;
}

export type EvidenceValidation =
  | { success: true; format: EvidenceFormat }
  | { success: false; error: 'evidence_unsupported' | 'evidence_empty' }
  | { success: false; error: 'evidence_too_large'; limitMB: number };

export function validateEvidenceFile(
  fileName: string,
  size: number,
  mimeType = ''
): EvidenceValidation {
  const entry = resolveEvidenceFormat(fileName, mimeType);
  if (!entry) return { success: false, error: 'evidence_unsupported' };
  if (!Number.isSafeInteger(size) || size <= 0) return { success: false, error: 'evidence_empty' };
  if (size > entry.maxBytes)
    return { success: false, error: 'evidence_too_large', limitMB: entry.maxBytes / MB };
  return { success: true, format: entry };
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

const BMFF_BRANDS = {
  heic: ['heic', 'heix', 'hevc', 'hevx'],
  heif: ['mif1', 'msf1', 'heic', 'heix', 'hevc', 'hevx'],
  mp4: ['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V '],
  mov: ['qt  '],
  m4a: ['M4A ', 'M4B ', 'M4P ', 'F4A ', 'isom', 'iso2'],
} as const;

function bmffMatches(bytes: Uint8Array, signature: keyof typeof BMFF_BRANDS): boolean {
  if (bytes.length < 16 || ascii(bytes, 4, 4) !== 'ftyp') return false;
  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (size < 16 || size % 4 !== 0) return false;
  const brands: readonly string[] = BMFF_BRANDS[signature];
  if (brands.includes(ascii(bytes, 8, 4))) return true;
  for (let offset = 16; offset + 4 <= Math.min(size, bytes.length); offset += 4) {
    if (brands.includes(ascii(bytes, offset, 4))) return true;
  }
  return false;
}

/** Header verification only: container formats are not parsed or malware-scanned. */
export function evidenceSignatureMatches(entry: EvidenceFormat, bytes: Uint8Array): boolean {
  switch (entry.signature) {
    case 'pdf':
      return ascii(bytes, 0, 5) === '%PDF-';
    case 'jpeg':
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case 'png':
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'webp':
      return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP';
    case 'wav':
      return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE';
    case 'ole':
      return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case 'zip':
      return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
    case 'mp3':
      return (
        ascii(bytes, 0, 3) === 'ID3' ||
        (bytes.length >= 2 &&
          bytes[0] === 0xff &&
          (bytes[1] & 0xe0) === 0xe0 &&
          (bytes[1] & 0x06) !== 0 &&
          (bytes[1] & 0x18) !== 0x08)
      );
    case 'webm':
      return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
    case 'ogg':
      return ascii(bytes, 0, 4) === 'OggS';
    default:
      return bmffMatches(bytes, entry.signature);
  }
}
