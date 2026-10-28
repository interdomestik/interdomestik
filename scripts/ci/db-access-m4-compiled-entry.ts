// Fixed ESM entry; no local constructor, adapter shim or cache observer.
export {
  startM4ObservedPrivateAssignmentOwner,
  takeM4StrictAssignmentOwnerContexts,
} from './apps/web/src/server/operations/m4-assignment-owner';

export {
  createM4ObservedPrivateAssignmentRuntime,
  takeM4StrictAssignmentContexts,
} from './apps/web/src/server/operations/m4-private-runtime';
