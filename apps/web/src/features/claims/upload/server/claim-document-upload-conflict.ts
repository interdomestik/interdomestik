/**
 * The signed upload id already names a document that is not this exact upload (different metadata,
 * uploader, claim, or tenant). The message is deliberately generic so no stored row is echoed;
 * existing callers surface it through their generic metadata-failure response.
 */
export class ClaimDocumentUploadConflictError extends Error {
  constructor() {
    super('Document upload conflicts with an existing document.');
    this.name = 'ClaimDocumentUploadConflictError';
  }
}
