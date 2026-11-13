import { describe, expect, it } from 'vitest';
import { evidenceSignatureMatches, resolveEvidenceFormat } from './evidence-file-policy';
import { webmFixture, zipFixture } from '../test/evidence-container-fixtures';

function matches(ext: string, bytes: Uint8Array, offset = 0): boolean {
  const format = resolveEvidenceFormat(`evidence.${ext}`, ext === 'webm' ? 'audio/webm' : '')!;
  return evidenceSignatureMatches(format, bytes.subarray(0, 256), {
    bytes: bytes.subarray(offset),
    offset,
  });
}

describe('OOXML package identity', () => {
  it.each(['docx', 'xlsx'])('rejects a generic ZIP renamed .%s', ext => {
    expect(matches(ext, zipFixture(['notes.txt']))).toBe(false);
    expect(matches(ext, new Uint8Array([0x50, 0x4b, 3, 4]))).toBe(false);
  });

  it.each([
    ['Word', 'docx', ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']],
    ['Excel', 'xlsx', ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml']],
    [
      'LibreOffice Writer',
      'docx',
      ['_rels/.rels', 'docProps/core.xml', 'word/document.xml', '[Content_Types].xml'],
    ],
    ['LibreOffice Calc', 'xlsx', ['_rels/.rels', 'xl/workbook.xml', '[Content_Types].xml']],
    ['Google Docs', 'docx', ['word/document.xml', 'docProps/app.xml', '[Content_Types].xml']],
    ['Google Sheets', 'xlsx', ['xl/workbook.xml', 'docProps/core.xml', '[Content_Types].xml']],
  ] as const)('accepts %s package ordering and rejects a cross-swap', (_producer, ext, names) => {
    const bytes = zipFixture(names, 8, 'export comment');
    expect(matches(ext, bytes)).toBe(true);
    expect(matches(ext === 'docx' ? 'xlsx' : 'docx', bytes)).toBe(false);
  });

  it('accepts a bounded suffix even when the directory is beyond the prefix', () => {
    const bytes = zipFixture(['[Content_Types].xml', 'word/document.xml'], 512);
    expect(matches('docx', bytes, 1000)).toBe(true);
  });

  it.each([
    ['word/document.xml'],
    ['[Content_Types].xml'],
    ['[Content_Types].xml', 'word/document.xml.bak'],
  ])('refuses missing or misleading package parts: %j', (...names) => {
    expect(matches('docx', zipFixture(names))).toBe(false);
  });

  it('refuses absent, truncated, oversized or malformed central directory evidence', () => {
    const bytes = zipFixture(['[Content_Types].xml', 'word/document.xml']);
    const format = resolveEvidenceFormat('file.docx')!;
    expect(evidenceSignatureMatches(format, bytes.subarray(0, 256))).toBe(false);
    expect(matches('docx', bytes.subarray(0, bytes.length - 1))).toBe(false);
    expect(matches('docx', bytes, bytes.length - 25)).toBe(false);
    expect(matches('docx', zipFixture(['[Content_Types].xml', 'word/document.xml'], 33000))).toBe(
      false
    );
    const broken = bytes.slice();
    new DataView(broken.buffer).setUint32(bytes.length - 6, 999999, true);
    expect(matches('docx', broken)).toBe(false);
  });

  it.each([26, 28])('refuses out-of-bounds local-header length at offset %s', offset => {
    const bytes = zipFixture(['[Content_Types].xml', 'word/document.xml']);
    new DataView(bytes.buffer).setUint16(offset, 65535, true);
    expect(matches('docx', bytes)).toBe(false);
  });

  it.each([8, 28, 30, 32, 34])('refuses malformed central-directory field at offset %s', field => {
    const bytes = zipFixture(['[Content_Types].xml', 'word/document.xml']);
    const view = new DataView(bytes.buffer);
    const directory = view.getUint32(bytes.length - 6, true);
    view.setUint16(directory + field, 65535, true);
    expect(matches('docx', bytes)).toBe(false);
  });
});

describe('WebM EBML document type', () => {
  it('accepts webm and rejects Matroska or a bare EBML marker', () => {
    expect(matches('webm', webmFixture())).toBe(true);
    expect(matches('webm', webmFixture('matroska'))).toBe(false);
    expect(matches('webm', new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]))).toBe(false);
  });

  it('does not search for a DocType inside another element or outside the header', () => {
    const nested = webmFixture();
    nested[9] = 0xec; // Void containing the DocType byte sequence.
    expect(matches('webm', nested)).toBe(false);
    const outside = webmFixture();
    outside[4] = 0x84; // EBML header ends before DocType.
    expect(matches('webm', outside)).toBe(false);
  });

  it('fails closed for every truncated header and invalid element size', () => {
    const bytes = webmFixture();
    for (let end = 0; end < bytes.length; end++) {
      expect(matches('webm', bytes.subarray(0, end))).toBe(false);
    }
    bytes[11] = 0xff; // Unknown/infinite DocType length.
    expect(matches('webm', bytes)).toBe(false);
  });
});
