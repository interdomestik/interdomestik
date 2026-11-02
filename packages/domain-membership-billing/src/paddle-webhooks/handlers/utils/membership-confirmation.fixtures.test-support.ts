import type { Mock } from 'vitest';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, vi } from 'vitest';

const authority: TenantAuthority = mintTestTenantAuthority('tenant_mk');

const sendThankYouLetter: Mock = vi.fn();

const prepareThankYouLetter: Mock = vi.fn();

const deliveryStore: { claimExisting: Mock; claim: Mock; ready: Mock; complete: Mock; fail: Mock } =
  {
    claimExisting: vi.fn().mockResolvedValue({ kind: 'not_found' }),
    claim: vi.fn(),
    ready: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  };

const userRecord = {
  email: 'member@example.test',
  name: 'Member One',
  memberNumber: 'MEM-2026-001',
};

const subscription = {
  id: 'sub_provider_1',
  status: 'active',
  items: [
    {
      price: {
        name: 'Annual membership',
        unit_price: { amount: '2000', currency_code: 'EUR' },
      },
    },
  ],
  billing_cycle: { frequency: 1, interval: 'year' },
  current_billing_period: {
    starts_at: '2026-01-01T00:00:00Z',
    ends_at: '2027-01-01T00:00:00Z',
  },
};

export function installMembershipConfirmationHooks(): void {
  beforeEach(() => {
    vi.clearAllMocks();
    sendThankYouLetter.mockResolvedValue({ success: true, id: 'email_123' });
    prepareThankYouLetter.mockImplementation(({ email }) => ({
      to: email,
      subject: 'Membership confirmed',
      html: '<p>Membership confirmed</p>',
      text: 'Membership confirmed',
    }));
    deliveryStore.claim.mockImplementation(async ({ snapshot }) => ({
      kind: 'claimed',
      deliveryId: 'delivery_123',
      requiresEffects: true,
      snapshot,
    }));
  });
}

export {
  authority,
  sendThankYouLetter,
  prepareThankYouLetter,
  deliveryStore,
  userRecord,
  subscription,
};
