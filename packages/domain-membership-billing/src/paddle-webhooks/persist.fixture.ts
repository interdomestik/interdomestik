import { beforeEach, vi, type Mock } from 'vitest';

const hoisted: {
  appendInvalidSignatureEvidence: Mock;
  admitVerifiedReceipt: Mock;
  completeReceiptLease: Mock;
} = vi.hoisted(() => ({
  appendInvalidSignatureEvidence: vi.fn(),
  admitVerifiedReceipt: vi.fn(),
  completeReceiptLease: vi.fn(),
}));

// Receipt persistence is a fixed privileged command; the domain only sees these three entry points.
vi.mock('@interdomestik/database', () => ({
  appendPaddleInvalidSignatureEvidence: hoisted.appendInvalidSignatureEvidence,
  admitVerifiedPaddleReceipt: hoisted.admitVerifiedReceipt,
  completePaddleReceiptLease: hoisted.completeReceiptLease,
}));

beforeEach(() => {
  vi.clearAllMocks();

  hoisted.appendInvalidSignatureEvidence.mockResolvedValue(undefined);
  hoisted.admitVerifiedReceipt.mockResolvedValue({
    outcome: 'admitted',
    lease: { id: 'we_1', leaseStartedAt: new Date('2026-09-25T08:00:00.000Z') },
    reclaimed: false,
  });
  hoisted.completeReceiptLease.mockResolvedValue(true);
});

export { hoisted };
