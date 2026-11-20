import { describe, expect, it } from 'vitest';
import {
  EVIDENCE_FILE_ACCEPT,
  EVIDENCE_FORMAT_LABEL,
  EVIDENCE_PREFIX_BYTES,
  evidenceSignatureMatches,
  resolveEvidenceFormat,
  validateEvidenceFile,
} from './evidence-file-policy';

const eml = 'From: synthetic@example.invalid\r\nSubject: One door\r\n\r\nSynthetic evidence.\r\n';

function matches(ext: string, content: string | Uint8Array): boolean {
  const format = resolveEvidenceFormat(`airline.${ext}`);
  expect(format).not.toBeNull();
  if (!format) return false;
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  return evidenceSignatureMatches(format, bytes);
}

describe('email claim evidence', () => {
  it.each([
    ['eml', 'message/rfc822', 'mail'],
    ['msg', 'application/vnd.ms-outlook', 'ole'],
  ])('approves .%s as a 10 MB document', (ext, mimeType, signature) => {
    expect(resolveEvidenceFormat(`airline.${ext.toUpperCase()}`)).toMatchObject({
      mimeType,
      category: 'document',
      signature,
      maxBytes: 10 * 1024 * 1024,
    });
    expect(validateEvidenceFile(`airline.${ext}`, 10 * 1024 * 1024)).toMatchObject({
      success: true,
    });
    expect(validateEvidenceFile(`airline.${ext}`, 10 * 1024 * 1024 + 1)).toEqual({
      success: false,
      error: 'evidence_too_large',
      limitMB: 10,
    });
    expect(EVIDENCE_FILE_ACCEPT.split(',')).toEqual(expect.arrayContaining([`.${ext}`, mimeType]));
    expect(EVIDENCE_FORMAT_LABEL).toContain(ext.toUpperCase());
  });

  it.each([
    eml,
    `\uFEFF${eml}`,
    'From synthetic@example.invalid Thu Nov 12 10:00:00 2026\r\nSubject: Flight\r\n',
    '\uFEFFFrom synthetic@example.invalid Thu Nov 12 10:00:00 2026\nSubject: Flight\n',
    'X-Airline-Reference: flight-123\r\n',
    '!9;~: printable field-name boundaries\r\n',
  ])('accepts a header or mbox envelope at the start: %j', content => {
    expect(matches('eml', content)).toBe(true);
  });

  it.each([
    '',
    'ordinary text renamed to .eml',
    '%PDF-1.7\r\nFrom: synthetic@example.invalid',
    '\r\nFrom: synthetic@example.invalid',
    ': empty field name',
    'Bad Name: spaces are not field-name characters',
    'Bad\tName: tabs are not field-name characters',
    '\u007f: DEL is not printable ASCII',
    'Ä: non-ASCII field name',
    'From: synthetic@example.invalid\0',
    'From: synthetic@example.invalid\r\n\r\nBinary\0body',
    'From synthetic@example.invalid\0\r\n',
    '\uFEFF\uFEFFFrom: synthetic@example.invalid',
    new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  ])('refuses binary or non-mail content renamed .eml: %j', content => {
    expect(matches('eml', content)).toBe(false);
  });

  it('bounds header detection and NUL checks to the configured prefix', () => {
    expect(matches('eml', `${'X'.repeat(EVIDENCE_PREFIX_BYTES)}: late header`)).toBe(false);
    expect(matches('eml', `Subject: ${'x'.repeat(EVIDENCE_PREFIX_BYTES)}\0`)).toBe(true);
  });

  it('accepts Outlook OLE content and refuses renamed text or truncated OLE', () => {
    expect(matches('msg', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe(
      true
    );
    expect(matches('msg', eml)).toBe(false);
    expect(matches('msg', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).toBe(false);
  });
});
