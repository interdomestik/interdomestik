import { readReceiptFile } from './receipt-io.mjs';
import { migrationSummary, prepareReceiptImport } from './legacy-receipt-client.mjs';
import { confirmLegacyMigration } from './migration-confirmation.mjs';

const MIGRATION_ERRORS = Object.freeze({
  session_expired: 'Sesioni ka përfunduar. Hyni përsëri.',
  forbidden: 'Nuk keni qasje në këtë migrim.',
  not_found: 'Detyra ose vërtetimi nuk u gjet.',
  unavailable: 'Migrimi nuk është i disponueshëm. Provoni përsëri.',
});

function migrationFailure(error) {
  const code = Object.hasOwn(MIGRATION_ERRORS, error?.code) ? error.code : 'unavailable';
  return { ok: false, code, message: MIGRATION_ERRORS[code] };
}

export async function importReceipt({
  assignmentId,
  file,
  repository,
  receiptStore,
  confirmMigration = confirmLegacyMigration,
}) {
  const bundle = await repository.loadAssignmentBundle(assignmentId);
  const read = await readReceiptFile(file);
  if (!bundle.ok) return bundle;
  if (!read.ok) return read;
  const prepared = await prepareReceiptImport(read.value, bundle.value);
  if (!prepared.ok) return prepared;
  const metadata = {
    packetId: bundle.value.packet.id,
    packetVersion: bundle.value.packet.version,
    assignmentId: bundle.value.assignment.id,
    reviewerFixtureId: bundle.value.reviewer.id,
    reviewerRole: bundle.value.reviewer.role,
    packetRole: bundle.value.packet.reviewerRole,
  };
  if (prepared.kind === 'signed') return receiptStore.import(read.value, metadata);
  if (!(await confirmMigration(migrationSummary(prepared.value)))) {
    return { ok: false, code: 'migration_cancelled', message: 'Migrimi u anulua.' };
  }
  let migrated;
  try {
    migrated = await repository.migrateReceipt({
      assignmentId,
      legacyReceipt: prepared.value,
      migrationConfirmed: true,
    });
  } catch (error) {
    return migrationFailure(error);
  }
  return receiptStore.save(migrated);
}
