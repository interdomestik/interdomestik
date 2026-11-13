import { describe, expect, it } from 'vitest';
import { documentFileKind, type DocumentFileKind } from './document-file-type';

const catalogs = import.meta.glob<{ common: { fileTypes: Record<string, string> } }>(
  '../../messages/*/common.json',
  { eager: true, import: 'default' }
);
const KINDS: DocumentFileKind[] = [
  'pdf',
  'word',
  'excel',
  'image',
  'audio',
  'video',
  'email',
  'file',
];

describe('documentFileKind', () => {
  it.each([
    ['application/pdf', 'pdf'],
    ['application/msword', 'word'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'word'],
    ['application/vnd.ms-excel', 'excel'],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'excel'],
    ['message/rfc822', 'email'],
    ['application/vnd.ms-outlook', 'email'],
    ['image/jpeg', 'image'],
    ['image/heic', 'image'],
    ['audio/mp4', 'audio'],
    ['audio/webm', 'audio'],
    ['video/quicktime', 'video'],
    ['APPLICATION/PDF; charset=binary', 'pdf'],
  ])('maps %s to %s', (mimeType, kind) => {
    expect(documentFileKind(mimeType)).toBe(kind);
  });

  it.each(['', 'text/plain', 'application/octet-stream', null, undefined])(
    'falls back to a generic file for %s',
    mimeType => {
      expect(documentFileKind(mimeType)).toBe('file');
    }
  );

  it.each(['sq', 'en', 'sr', 'mk', 'de'])('labels every file kind in the %s catalog', locale => {
    const labels = catalogs[`../../messages/${locale}/common.json`].common.fileTypes;
    expect(Object.keys(labels).sort()).toEqual([...KINDS].sort());
    for (const kind of KINDS) expect(labels[kind].trim()).not.toBe('');
  });
});
