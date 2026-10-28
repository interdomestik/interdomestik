import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleStatusChangeNotification } from './status-notification';
const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), notify: vi.fn(), context: vi.fn() }));
vi.mock('@interdomestik/database', () => ({
  withTenantContext: async (context: unknown, action: (tx: unknown) => unknown) => {
    mocks.context(context);
    return action({ query: { user: { findFirst: mocks.findFirst } } });
  },
}));
vi.mock('@interdomestik/database/tenant-security', () => ({ withTenant: vi.fn() }));
const input = {
  claimId: 'claim-1',
  claimTitle: 'Claim',
  tenantId: 'tenant-1',
  userId: 'member-1',
  oldStatus: 'submitted' as const,
  newStatus: 'verification' as const,
  deps: { notifyStatusChanged: mocks.notify },
};
describe('staff status notification scheduling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({ email: 'member@example.com' });
  });
  it('dispatches the persisted status with its validated tenant after scoped recipient lookup', async () => {
    scheduleStatusChangeNotification(input);
    await vi.waitFor(() =>
      expect(mocks.notify).toHaveBeenCalledWith(
        'member-1',
        'member@example.com',
        { id: 'claim-1', title: 'Claim' },
        'submitted',
        'verification',
        { tenantId: 'tenant-1' }
      )
    );
    expect(mocks.context).toHaveBeenCalledWith({ tenantId: 'tenant-1' });
  });
  it('does not dispatch an unchanged status or unavailable recipient', async () => {
    scheduleStatusChangeNotification({ ...input, oldStatus: 'verification' });
    expect(mocks.context).not.toHaveBeenCalled();
    mocks.findFirst.mockResolvedValueOnce(undefined);
    scheduleStatusChangeNotification(input);
    await vi.waitFor(() => expect(mocks.findFirst).toHaveBeenCalledOnce());
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it('preserves best-effort scheduling on recipient SQL failure', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.findFirst.mockRejectedValueOnce(new Error('fixture SQL failure'));
    scheduleStatusChangeNotification(input);
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    expect(mocks.notify).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
