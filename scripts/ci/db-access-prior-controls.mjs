import { createSourceModel } from './db-access-source.mjs';
import { createProvenance } from './db-access-provenance.mjs';
import { collectInventory } from './db-access-inventory.mjs';
import { captureStatusReturnPriorRow } from './db-access-status-return-equivalence.mjs';
import { captureClaimHistoryPriorRow } from './db-access-claim-history-correspondence.mjs';

// The original finalizer's historical computation, without a supplied observation or cache.
// Both serial and owned-worker callers use the same current engine over the exact ADOPTION Map.
export function computePriorControls(trusted) {
  const beforeModel = createSourceModel(trusted, trusted);
  const beforeProvenance = createProvenance(beforeModel);
  const before = collectInventory(beforeModel, beforeProvenance, trusted);
  return {
    analysisUnknown: [...beforeProvenance.analysisUnknown],
    statusReturnPriorRow: captureStatusReturnPriorRow(before.entries),
    claimHistoryPriorRow: captureClaimHistoryPriorRow(
      before.entries,
      beforeProvenance.analysisUnknown
    ),
    priorScoped: [
      ...new Set(
        before.entries
          .filter(entry => entry.tenantPosture === 'tenant-context')
          .map(entry => entry.file)
      ),
    ],
  };
}
