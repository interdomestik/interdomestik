import { beforeEach, vi, type Mock } from 'vitest';
import { deliveryFailure } from '@interdomestik/domain-communications/notification-deliveries/worker';
import { delivery, harness } from './run.test-support';

const mocks: { withAuthority: Mock; prepare: Mock } = vi.hoisted(() => ({
  withAuthority: vi.fn(),
  prepare: vi.fn(),
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: mocks.withAuthority,
}));
vi.mock('./prepare-notification-delivery', () => ({ prepareNotificationDelivery: mocks.prepare }));

const setup = (...rows: ReturnType<typeof delivery>[]) =>
  harness(mocks.withAuthority, mocks.prepare, rows);
const refused = { ...deliveryFailure('smtp_pre_acceptance', true), preAcceptance: true };
const ambiguous = { ...deliveryFailure('timeout', true), ambiguous: true };

beforeEach(() => vi.resetAllMocks());

export { ambiguous, mocks, refused, setup };
