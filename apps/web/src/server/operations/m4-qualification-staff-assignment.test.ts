import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeM4QualificationStaffAssignment as assignClaimCore } from './m4-qualification-staff-assignment';
import * as relay from '@/server/operations/m4-assignment-relay';
import { revalidatePath } from 'next/cache';
vi.mock('@/server/operations/m4-assignment-relay', async () => ({
  ...(await vi.importActual<typeof import('@/server/operations/m4-assignment-relay')>(
    '@/server/operations/m4-assignment-relay'
  )),
  relayStaffAssignment: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
describe('staff assignment mandatory-audit owner relay', () => {
  beforeEach(() => vi.clearAllMocks());
  it('uses literal staff owner instead of optional caller-provided audit callbacks', async () => {
    const requestHeaders = new Headers({ 'user-agent': 'Vitest', cookie: 'original' }),
      operationId = '00000000-0000-4000-8000-000000000001';
    vi.mocked(relay.relayStaffAssignment).mockResolvedValueOnce({
      status: 'completed',
      operationId,
      replayed: false,
      result: { success: true },
      changed: true,
    });
    expect(
      await assignClaimCore({ claimId: 'claim-1', requestHeaders, staffId: 'staff-2', operationId })
    ).toEqual({ success: true });
    expect(relay.relayStaffAssignment).toHaveBeenCalledWith({
      claimId: 'claim-1',
      requestHeaders,
      staffId: 'staff-2',
      operationId,
    });
    expect(revalidatePath).toHaveBeenCalledTimes(8);
  });
  it('preserves omitted self target versus explicit clear target', async () => {
    const requestHeaders = new Headers();
    vi.mocked(relay.relayStaffAssignment).mockResolvedValue({
      status: 'denied',
      reason: 'UNAUTHORIZED',
    });
    await assignClaimCore({ claimId: 'claim-1', requestHeaders });
    expect(relay.relayStaffAssignment).toHaveBeenLastCalledWith({
      claimId: 'claim-1',
      requestHeaders,
    });
    await assignClaimCore({ claimId: 'claim-1', requestHeaders, staffId: null });
    expect(relay.relayStaffAssignment).toHaveBeenLastCalledWith({
      claimId: 'claim-1',
      requestHeaders,
      staffId: null,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
