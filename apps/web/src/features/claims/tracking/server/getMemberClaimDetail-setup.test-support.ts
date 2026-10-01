import { vi } from 'vitest';
import { getMemberDetailMocks } from './getMemberClaimDetail-test-support';
import {
  buildRecoveryDecisionSnapshotMock,
  toMemberSafeRecoveryDecisionMock,
} from './getMemberClaimDetail-recovery.test-support';
import { normalizeMemberTimelineMockRows } from './member-domain-event-timeline.test-support';
const hoisted = getMemberDetailMocks();
function configureSelectMocks() {
  const ordered = { limit: () => hoisted.recoveryDecisionRows() };
  const filtered = { orderBy: () => ordered };
  const joined = { where: () => filtered };
  const source = { leftJoin: () => joined };
  hoisted.select.mockReturnValueOnce({ from: () => source });
}

export function configureMemberDetailTest() {
  vi.clearAllMocks();
  hoisted.ensureClaimsAccess.mockReturnValue({
    tenantId: 'tenant-1',
    userId: 'member-1',
    role: 'member',
    branchId: null,
  });
  hoisted.buildClaimVisibilityWhere.mockReturnValue({ visibility: 'member' });
  hoisted.getMatterAllowanceVisibility.mockResolvedValue(null);
  hoisted.getMemberVaultConsentDisplay.mockResolvedValue({ kind: 'hidden' });
  hoisted.buildRecoveryDecisionSnapshot.mockImplementation(buildRecoveryDecisionSnapshotMock);
  hoisted.toMemberSafeRecoveryDecision.mockImplementation(toMemberSafeRecoveryDecisionMock);
  hoisted.deriveCaseCompanionNextStep.mockReturnValue(hoisted.caseCompanionNextStep);
  hoisted.getMemberTimelineFromDomainEvents.mockImplementation(async context => {
    return normalizeMemberTimelineMockRows(context, await hoisted.timelineRows());
  });
  configureSelectMocks();
  hoisted.recoveryDecisionRows.mockResolvedValue([]);
}
