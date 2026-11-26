import {
  persistClaimDocumentMetadata,
  type PersistClaimDocumentParams,
} from './claim-document-write';

export { InformationRequestUploadConflictError, type UploadCategory } from './claim-document-write';

/** The legacy entry points delegate here. Evidence extraction is dormant for confirmations. */
export async function persistClaimDocumentAndQueueWorkflows(
  params: PersistClaimDocumentParams
): Promise<void> {
  await persistClaimDocumentMetadata(params);
}
