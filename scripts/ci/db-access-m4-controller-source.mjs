// Public compatibility entry; one successor grammar only, with mandatory wireSource.
export {
  deriveM4AssignmentControllers,
  deriveM4AssignmentControllers as deriveM4OpsController,
} from './db-access-m4-four-controller-source.mjs';
export const M4_CONTROLLER_FILE = 'apps/web/src/server/operations/m4-ops-controller.ts';
export const M4_PROTOCOL_FILE = 'apps/web/src/server/operations/m4-assignment-protocol.ts';
export const M4_WIRE_FILE = 'apps/web/src/server/operations/m4-assignment-wire.ts';
