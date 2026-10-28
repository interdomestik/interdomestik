// Complete original planning membership is retained, never treated as runtime authority.
const witnesses = {
  sourceCommit: '2f0225a4e1eec865447ebdf67356dfcf71969fb4',
  sourceTree: '7d1c7663690c2412a47acfa8d48b47115598fd38',
  rows: [
    {
      identity: 'd79ddd457fd45d7be93b4b0a19216d9fa8e6f164bdf96a63822296a2419b3dbc',
      file: 'apps/web/src/actions/admin-claims/assign.core.ts',
      originalSourceSha256: '99735a54470dd1883d7befcd53ed63456292c5706b3321ad435da90262676f64',
      currentSourceSha256: '99735a54470dd1883d7befcd53ed63456292c5706b3321ad435da90262676f64',
      sameOriginalBytes: true,
      originalOwner: ['apps/web/src/actions/admin-claims/assign.core.ts', 604, 2639, 263],
      originalOperation: ['apps/web/src/actions/admin-claims/assign.core.ts', 1304, 1313, 212],
      currentDisposition: 'preserved-live; no deletion or replacement retirement',
    },
    {
      identity: 'e25ca13641fbd203476a6935501e8f7ff98706af3a886a50505872f841a71ef1',
      file: 'apps/web/src/actions/admin-claims/assign.core.ts',
      originalSourceSha256: '99735a54470dd1883d7befcd53ed63456292c5706b3321ad435da90262676f64',
      currentSourceSha256: '99735a54470dd1883d7befcd53ed63456292c5706b3321ad435da90262676f64',
      sameOriginalBytes: true,
      originalOwner: ['apps/web/src/actions/admin-claims/assign.core.ts', 604, 2639, 263],
      originalOperation: ['apps/web/src/actions/admin-claims/assign.core.ts', 1871, 1880, 212],
      currentDisposition: 'preserved-live; no deletion or replacement retirement',
    },
    {
      identity: '3abe201e80665b5f1d95dd025e8694e386fd4eedab84512fa06b501c27ad7353',
      file: 'apps/web/src/actions/admin-claims/assign.wrapper.test.ts',
      originalSourceSha256: '8f9a7940732123d60ea3ec2dea4057aafed14e9a8b7e35a74186ecbdb0bd1925',
      currentSourceSha256: '8f9a7940732123d60ea3ec2dea4057aafed14e9a8b7e35a74186ecbdb0bd1925',
      sameOriginalBytes: true,
      originalOwner: ['apps/web/src/actions/admin-claims/assign.wrapper.test.ts', 856, 969, 220],
      originalOperation: [
        'apps/web/src/actions/admin-claims/assign.wrapper.test.ts',
        862,
        969,
        218,
      ],
      currentDisposition: 'preserved-live; no deletion or replacement retirement',
    },
    {
      identity: '23045f68d4b176bb5a96c7ce1100eb6639006081e00ffbb87a42f31871abbab0',
      file: 'apps/web/src/actions/admin-claims/assign.wrapper.test.ts',
      originalSourceSha256: '8f9a7940732123d60ea3ec2dea4057aafed14e9a8b7e35a74186ecbdb0bd1925',
      currentSourceSha256: '8f9a7940732123d60ea3ec2dea4057aafed14e9a8b7e35a74186ecbdb0bd1925',
      sameOriginalBytes: true,
      originalOwner: ['apps/web/src/actions/admin-claims/assign.wrapper.test.ts', 1023, 1069, 220],
      originalOperation: [
        'apps/web/src/actions/admin-claims/assign.wrapper.test.ts',
        1029,
        1069,
        218,
      ],
      currentDisposition: 'preserved-live; no deletion or replacement retirement',
    },
    {
      identity: 'c604e63c5e5857187db7e72ccf5b177e5dab1a1145a0fe26ca3dda9bc1724450',
      file: 'apps/web/src/actions/admin-claims/context.core.ts',
      originalSourceSha256: '5572db14c533bb1460ab53fe8f0b8fb149210439137dd1f99323437b35cc4841',
      currentSourceSha256: '5572db14c533bb1460ab53fe8f0b8fb149210439137dd1f99323437b35cc4841',
      sameOriginalBytes: true,
      originalOwner: ['apps/web/src/actions/admin-claims/context.core.ts', 146, 346, 263],
      originalOperation: ['apps/web/src/actions/admin-claims/context.core.ts', 315, 343, 211],
      currentDisposition: 'preserved-live; no deletion or replacement retirement',
    },
  ],
  currentAdminCallsGetActionContextFrom: ['assignClaim', 'updateClaimStatus'],
  runtimeAcceptanceClaimed: false,
};
import { same, one, fail, hex } from './db-access-m4-compiled-context-common.mjs';
export function retainCompiledHistoricalRelations(native, relation, source) {
  const lineage = native.rawGraph.m4Contexts.affectedLineage;
  const purposeRelations = witnesses.rows.map(witness => {
    const selected = one(
      lineage.selection.entries,
      row => row.identity === witness.identity,
      'retained original witness'
    );
    if (
      !same(selected.owner, witness.originalOwner) ||
      !same(selected.operation, witness.originalOperation)
    )
      fail('retained original exact owner/operation');
    const sites = lineage.selection.sites.filter(site => site.file === witness.file);
    if (!sites.length || sites.some(site => site.sourceSha256 !== witness.originalSourceSha256))
      fail('actual retained original source/canonical catalog');
    if (
      witness.file.endsWith('/context.core.ts') &&
      !hex(source.sourceRecords['apps/web/src/lib/auth/current-store-session.ts']?.sha256)
    )
      fail('required verifier source callee');
    const family = witness.file.endsWith('/assign.wrapper.test.ts')
      ? 'P-original-factory'
      : witness.file.endsWith('/context.core.ts')
        ? 'current-store-authority-counterpart'
        : 'legacy-assignment-effect-counterpart';
    const candidates = relation.references.filter(row =>
      family === 'current-store-authority-counterpart'
        ? row.file.endsWith('/m4-ops-controller.ts')
        : row.file.endsWith('/m4-legacy-assignment-kernel.ts')
    );
    if (family !== 'P-original-factory' && !candidates.length)
      fail('required historical purpose/effect counterpart');
    return {
      identity: witness.identity,
      originalInventoryIndex: selected.inventoryIndex,
      originalOwner: witness.originalOwner,
      originalOperation: witness.originalOperation,
      sourceSha256: witness.originalSourceSha256,
      purpose: family,
      requiredVerifierSource:
        family === 'current-store-authority-counterpart'
          ? {
              file: 'apps/web/src/lib/auth/current-store-session.ts',
              ...source.sourceRecords['apps/web/src/lib/auth/current-store-session.ts'],
              binding:
                'actual captured fixed current-store verifier + mandatory current-store SQL cases; no fabricated verifier inventory entry',
            }
          : null,
      currentCounterpartOperations:
        family === 'P-original-factory'
          ? []
          : candidates.map(row => ({
              inventoryIndex: row.inventoryIndex,
              identity: row.identity,
              operation: row.operation,
            })),
      disposition: 'preserved live original; counterpart construction does not retire it',
      wholeOriginalIdentityQualified: false,
    };
  });
  return {
    namespace: {
      sourceCommit: witnesses.sourceCommit,
      sourceTree: witnesses.sourceTree,
      originalSourceLabelErratumApplied: true,
      planningMembershipIsRuntimeAuthority: false,
    },
    purposeRelations,
    affectedSelection: {
      entries: lineage.selection.entries.map(row => ({
        inventoryIndex: row.inventoryIndex,
        identity: row.identity,
        owner: row.owner,
        operation: row.operation,
        memberships: row.memberships,
      })),
      sites: lineage.selection.sites,
      allRawBatchesRetained: true,
    },
    originalTAndSWholeIdentityAcceptance: [],
    originalFactoryAcceptance: 'computed separately by unchanged all-context factory rule',
  };
}
