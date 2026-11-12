import {
  webmFixture,
  zipFixture,
} from '../../../../../../packages/domain-claims/src/test/evidence-container-fixtures';
import { describe, expect, it } from 'vitest';
import {
  EVIDENCE_FILE_ACCEPT,
  evidenceSignatureMatches,
  resolveEvidenceFormat,
  validateEvidenceFile,
} from './evidence-file-policy';

const MB = 1024 * 1024;
const FORMATS = [
  ['pdf', 'application/pdf', 'document', 10],
  ['jpg', 'image/jpeg', 'image', 10],
  ['jpeg', 'image/jpeg', 'image', 10],
  ['jfif', 'image/jpeg', 'image', 10],
  ['png', 'image/png', 'image', 10],
  ['heic', 'image/heic', 'image', 10],
  ['heif', 'image/heif', 'image', 10],
  ['webp', 'image/webp', 'image', 10],
  ['doc', 'application/msword', 'document', 10],
  [
    'docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'document',
    10,
  ],
  ['xls', 'application/vnd.ms-excel', 'document', 10],
  ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'document', 10],
  ['eml', 'message/rfc822', 'document', 10],
  ['msg', 'application/vnd.ms-outlook', 'document', 10],
  ['mp3', 'audio/mpeg', 'audio', 10],
  ['m4a', 'audio/mp4', 'audio', 10],
  ['wav', 'audio/wav', 'audio', 10],
  ['mp4', 'video/mp4', 'video', 50],
  ['mov', 'video/quicktime', 'video', 50],
] as const;

describe('owner-approved claim evidence formats', () => {
  it.each(FORMATS)(
    'accepts .%s with its canonical MIME and limit',
    (ext, mimeType, category, limit) => {
      expect(resolveEvidenceFormat(`Evidence.${ext.toUpperCase()}`)).toMatchObject({
        mimeType,
        category,
        maxBytes: limit * MB,
      });
      expect(validateEvidenceFile(`evidence.${ext}`, limit * MB)).toMatchObject({ success: true });
      expect(validateEvidenceFile(`evidence.${ext}`, limit * MB + 1)).toEqual({
        success: false,
        error: 'evidence_too_large',
        limitMB: limit,
      });
      expect(EVIDENCE_FILE_ACCEPT.split(',')).toContain(`.${ext}`);
    }
  );

  it.each([
    'txt',
    'csv',
    'json',
    'xml',
    'zip',
    'gif',
    'bmp',
    'tif',
    'tiff',
    'avi',
    'rtf',
    'odt',
    'ods',
    'ppt',
    'pptx',
    'webm',
    'ogg',
    'bin',
  ])('refuses .%s without starting an upload', ext => {
    expect(validateEvidenceFile(`evidence.${ext}`, 100)).toEqual({
      success: false,
      error: 'evidence_unsupported',
    });
    expect(EVIDENCE_FILE_ACCEPT.split(',')).not.toContain(`.${ext}`);
  });

  it.each([0, -1, NaN, Infinity, 1.5])('refuses empty or invalid size %s', size => {
    expect(validateEvidenceFile('evidence.pdf', size)).toEqual({
      success: false,
      error: 'evidence_empty',
    });
  });

  it.each([
    ['webm', 'audio/webm;codecs=opus'],
    ['ogg', 'audio/ogg'],
    ['mp4', 'audio/mp4'],
  ])('preserves the voice recorder .%s type', (ext, type) => {
    expect(resolveEvidenceFormat(`voice.${ext}`, type)).toMatchObject({
      category: 'audio',
      maxBytes: 10 * MB,
      mimeType: type.split(';')[0],
    });
  });
  it('refuses WebM video and extensionless files even with an allowed MIME', () => {
    expect(resolveEvidenceFormat('clip.webm', 'video/webm')).toBeNull();
    expect(resolveEvidenceFormat('receipt', 'application/pdf')).toBeNull();
    expect(resolveEvidenceFormat('.pdf', 'application/pdf')).toBeNull();
  });
});

function bytes(value: string | number[]): Uint8Array {
  return typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
}

function bmff(brand: string, compatible = ''): Uint8Array {
  const result = bytes(`\0\0\0\0ftyp${brand}\0\0\0\0${compatible}`);
  new DataView(result.buffer).setUint32(0, result.length);
  return result;
}

describe('evidence signatures', () => {
  it.each([
    ['pdf', bytes('%PDF-1.7')],
    ['jpg', bytes([0xff, 0xd8, 0xff])],
    ['png', bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['webp', bytes('RIFF1234WEBP')],
    ['wav', bytes('RIFF1234WAVE')],
    ['doc', bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
    ['xls', bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
    ['docx', zipFixture(['[Content_Types].xml', 'word/document.xml'])],
    ['xlsx', zipFixture(['[Content_Types].xml', 'xl/workbook.xml'])],
    ['mp3', bytes('ID3')],
    ['mp3', bytes([0xff, 0xfb])],
    ['mp3', bytes([0xff, 0xe3])],
    ['heic', bmff('heic')],
    ['heif', bmff('mif1')],
    ['heic', bmff('mif1', 'heic')],
    ['mp4', bmff('isom', 'mp42')],
    ['mov', bmff('qt  ')],
    ['mov', bytes('\0\0\0\x08wide\0\0\x10\0mdat')], // Legacy QuickTime: no ftyp atom.
    ['mov', bytes('\0\0\x01\0moov')],
    ['mov', bytes('\0\0\0\x01mdat')], // 64-bit extended atom size.
    ['m4a', bmff('M4A ')],
  ])('accepts the declared .%s signature', (ext, prefix) => {
    const format = resolveEvidenceFormat(`file.${ext}`)!;
    expect(evidenceSignatureMatches(format, prefix, { bytes: prefix, offset: 0 })).toBe(true);
    expect(evidenceSignatureMatches(format, bytes('plain text renamed to a file'))).toBe(false);
    expect(evidenceSignatureMatches(format, bytes([]))).toBe(false);
  });

  it.each([
    ['pdf', bytes('%PDF')],
    ['png', bytes([0x89, 0x50])],
    ['jpg', bytes([0xff, 0xd8, 0])],
    ['webp', bytes('RIFF1234WAVE')],
    ['wav', bytes('RIFF1234WEBP')],
    ['docx', bytes([0x50, 0x4b, 5, 6])],
    ['mp3', bytes([0xff, 0x00])],
    ['mp3', bytes([0xff, 0xf1])], // AAC ADTS, not an MPEG audio frame.
    ['mp3', bytes([0xff, 0xeb])], // Reserved MPEG version.
    ['png', bytes([0x89, 0x50, 0x4e, 0x47])],
    ['png', bytes([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])],
    ['doc', bytes([0xd0, 0xcf, 0x11, 0xe0])],
    ['xls', bytes([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0])],
    ['heic', bmff('avif')],
    ['mp4', bmff('heic')],
    ['mov', bmff('isom')],
    ['mov', bytes('\0\0\0\x04moov')], // Atom size smaller than its own header.
    ['mov', bytes('\0\0\0\x08trak')], // Not a top-level leading atom.
    ['mp4', bytes('\0\0\0\x08moov')], // Legacy QuickTime leniency is .mov only.
    ['m4a', bmff('mp42')],
    ['mp4', bytes('\0\0\0\x08ftypisom')],
  ])('refuses spoofed or truncated .%s content', (ext, prefix) => {
    expect(evidenceSignatureMatches(resolveEvidenceFormat(`file.${ext}`)!, prefix)).toBe(false);
  });

  it.each([
    ['webm', 'audio/webm', webmFixture()],
    ['ogg', 'audio/ogg', bytes('OggS')],
    ['mp4', 'audio/mp4', bmff('M4A ')],
  ])('checks existing voice .%s signatures', (ext, type, prefix) => {
    expect(evidenceSignatureMatches(resolveEvidenceFormat(`voice.${ext}`, type)!, prefix)).toBe(
      true
    );
  });
});
