import { describe, expect, it } from 'vitest';
import { documentFileKind } from './document-file-type';

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
});
