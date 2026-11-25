import { createHash } from 'node:crypto';

export function digestLegalDocument(renderedValues: readonly string[]): string {
  return createHash('sha256')
    .update(renderedValues.join('\n').normalize('NFC'), 'utf8')
    .digest('hex');
}
