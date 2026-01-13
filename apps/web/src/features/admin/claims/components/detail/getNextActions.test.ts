import { describe, expect, it } from 'vitest';
import type { ClaimOpsDetail } from '../../types';
import { getNextActions } from './getNextActions';

// Mock helper
const mockClaim = (overrides: Partial<ClaimOpsDetail>): ClaimOpsDetail => ({
  id: 'claim-123',
  code: 'CLAIM-123',
  claimNumber: 'CLM-XK-KS01-2026-000001',
  title: 'Test Claim',
  lifecycleStage: 'processing',
  stageStartedAt: new Date(),
  daysInStage: 2,
  ownerRole: 'staff',
  ownerName: null,
  assigneeId: null,
  isStuck: false,
  hasSlaBreach: false,
  isUnassigned: true,
  waitingOn: 'staff',
  hasCashPending: false,
  memberId: 'member-123',
  memberName: 'John Doe',
  memberEmail: 'john@example.com',
  branchCode: 'B01',
  agentName: null,
  category: 'auto',
  status: 'evaluation',
  description: 'Desc',
  docs: [],
  companyName: 'Acme Corp',
  claimAmount: '1000',
  currency: 'EUR',
  createdAt: new Date(),
  originType: 'portal',
  originRefId: null,
  originDisplayName: null,
  memberNumber: 'MEM-2026-0001',
  ...overrides,
});

describe('getNextActions', () => {
  it('should prioritize SLA breach over assignment', () => {
    const claim = mockClaim({ hasSlaBreach: true, isUnassigned: true });
    const result = getNextActions(claim, 'user-1');
    expect(result.primary?.type).toBe('ack_sla');
    expect(result.secondary.find(a => a.type === 'assign')).toBeDefined();
  });

  it('should show "Assign Owner" for unassigned staff task', () => {
    const claim = mockClaim({ hasSlaBreach: false, isUnassigned: true, waitingOn: 'staff' });
    const result = getNextActions(claim, 'user-1');
    expect(result.primary?.type).toBe('assign');
  });

  it('should NOT show "Assign Owner" as primary if waiting on member', () => {
    // Even if unassigned (staffId null), if waiting on member (e.g. Draft or Verification), correct logic?
    // Logic says assignmentRelevant depends on waitingOn !== 'member'.
    // If draft, owner is member.
    const claim = mockClaim({
      status: 'draft',
      ownerRole: 'member',
      isUnassigned: true,
      waitingOn: 'member',
    });
    const result = getNextActions(claim, 'user-1');
    expect(result.primary?.type).toBe('message_poke');
    expect(result.showAssignment).toBe(false); // Should hide assignment if member owned? Or just not relevant. Logic says showAssignment if staff owned generally.
  });

  it('should show "Review Blockers" if Stuck', () => {
    const claim = mockClaim({ isStuck: true, isUnassigned: false, assigneeId: 'user-1' });
    const result = getNextActions(claim, 'user-1');
    expect(result.primary?.type).toBe('review_blockers');
  });

  it('should show "Advance Status" for assigned staff owner (me)', () => {
    const claim = mockClaim({
      status: 'evaluation',
      ownerRole: 'staff',
      assigneeId: 'me',
      isUnassigned: false,
    });
    const result = getNextActions(claim, 'me');
    expect(result.primary?.type).toBe('update_status');
  });

  it('should show "Reopen" for terminal status', () => {
    const claim = mockClaim({ status: 'rejected' }); // Allow reopening
    const result = getNextActions(claim, 'user-1');
    expect(result.primary?.type).toBe('reopen');
  });
});
