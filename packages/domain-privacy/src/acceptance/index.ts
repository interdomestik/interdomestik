export { currentLegalVersions } from './current-versions';
export { digestLegalDocument } from './digest';
export {
  currentLegalDocuments,
  isLegalAcceptanceRole,
  legalDocumentKinds,
  type LegalDocument,
  type LegalDocumentKind,
} from './documents';
export {
  checkRenderedLegalTexts,
  listMembersWithoutAcceptance,
  readOwnAcceptanceState,
} from './queries';
export { acceptLegalDocuments } from './record';
export type { LegalTextFailure, RenderedLegalText } from './registry';
export { getAcceptanceState, type AcceptanceState } from './state';
