import type { CashVerificationRequestDTO } from '../../server/types';

export function createRequest(
  overrides: Partial<CashVerificationRequestDTO> = {}
): CashVerificationRequestDTO {
  return {
    id: 'attempt-1',
    leadId: 'lead-1',
    firstName: 'Ana',
    lastName: 'Doe',
    email: 'ana.doe@example.com',
    amount: 2500,
    currency: 'EUR',
    status: 'pending',
    isResubmission: false,
    createdAt: new Date('2026-10-01T09:00:00.000Z'),
    updatedAt: new Date('2026-10-02T09:00:00.000Z'),
    branchId: 'branch-1',
    branchCode: 'B-01',
    branchName: 'Tirana',
    agentId: 'agent-1',
    agentName: 'Agent One',
    agentEmail: 'agent.one@example.com',
    documentId: null,
    documentPath: null,
    verificationNote: null,
    verifierName: null,
    ...overrides,
  };
}
