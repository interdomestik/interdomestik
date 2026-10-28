import {beforeEach,describe,expect,it,vi} from './vendor.mjs';
import {getMock,materializeMocks} from './registry.mjs';
vi.mock('@/server/operations/m4-assignment-relay', async () => ({
  ...(await vi.importActual<typeof import('@/server/operations/m4-assignment-relay')>(
    '@/server/operations/m4-assignment-relay'
  )),
  relayLegacyAdminAssignment: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const operationId = '00000000-0000-4000-8000-000000000001';
const params = {
  claimId: 'claim1',
  staffId: 'staff1',
  requestHeaders: new Headers({ cookie: 'original' }),
  operationId,
};
const completed = (
  changed: boolean,
  result = { success: true as boolean, error: undefined as string | undefined }
) => ({ status: 'completed' as const, operationId, replayed: false, result, changed });
await materializeMocks();
const relay=getMock("@/server/operations/m4-assignment-relay");
const {revalidatePath}=getMock('next/cache');
const {executeM4QualificationAdminAssignment:assignClaimCore}=await import('./wrapper.mjs');
describe('admin assignment relay adapter', () => {
  beforeEach(() => vi.clearAllMocks());
  it('calls only the literal admin relay with bounded request inputs', async () => {
    vi.mocked(relay.relayLegacyAdminAssignment).mockResolvedValueOnce(completed(true) as never);
    await assignClaimCore(params);
    expect(relay.relayLegacyAdminAssignment).toHaveBeenCalledWith(params);
    expect(relay.relayLegacyAdminAssignment).toHaveBeenCalledTimes(1);
  });
  it('revalidates every original locale path after committed changed assignment', async () => {
    vi.mocked(relay.relayLegacyAdminAssignment).mockResolvedValueOnce(completed(true) as never);
    await assignClaimCore(params);
    expect(revalidatePath).toHaveBeenCalledTimes(24);
    for (const locale of ['sq', 'en', 'sr', 'mk'])
      for (const page of [
        '/member/claims',
        '/member/claims/claim1',
        '/admin/claims',
        '/admin/claims/claim1',
        '/staff/claims',
        '/staff/claims/claim1',
      ])
        expect(revalidatePath).toHaveBeenCalledWith('/' + locale + page);
  });
  it('does not revalidate on completed domain refusal', async () => {
    vi.mocked(relay.relayLegacyAdminAssignment).mockResolvedValueOnce(
      completed(false, { success: false, error: 'Claim not found' }) as never
    );
    expect(await assignClaimCore(params)).toEqual({ success: false, error: 'Claim not found' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it('preserves unexpected relay exception propagation', async () => {
    vi.mocked(relay.relayLegacyAdminAssignment).mockRejectedValueOnce(
      Error('unexpected owner failure')
    );
    await expect(assignClaimCore(params)).rejects.toThrow('unexpected owner failure');
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it('backend-confirmed no-op returns success without cache mutation', async () => {
    vi.mocked(relay.relayLegacyAdminAssignment).mockResolvedValueOnce(completed(false) as never);
    expect((await assignClaimCore(params)).success).toBe(true);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it('passes current backend authorization denial without local read or success', async () => {
    vi.mocked(relay.relayLegacyAdminAssignment).mockResolvedValueOnce({
      status: 'denied',
      reason: 'UNAUTHORIZED',
    });
    expect(await assignClaimCore(params)).toEqual({ success: false, error: 'Unauthorized' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it('preserves backend self-assignment denial and does not revalidate', async () => {
    vi.mocked(relay.relayLegacyAdminAssignment).mockResolvedValueOnce({
      status: 'denied',
      reason: 'SELF_ASSIGNMENT_ONLY',
    });
    expect(await assignClaimCore(params)).toEqual({
      success: false,
      error: 'Access denied: Cannot assign other staff',
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it('unchanged committed assignee uses authoritative changed bit without second ambient read', async () => {
    vi.mocked(relay.relayLegacyAdminAssignment).mockResolvedValueOnce({
      ...completed(false),
      replayed: true,
    } as never);
    await assignClaimCore(params);
    expect(relay.relayLegacyAdminAssignment).toHaveBeenCalledTimes(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it('missing backend resource cannot become successful post-mutation read', async () => {
    vi.mocked(relay.relayLegacyAdminAssignment).mockResolvedValueOnce({
      status: 'denied',
      reason: 'RESOURCE_DENIED',
    });
    expect(await assignClaimCore(params)).toEqual({ success: false, error: 'Claim not found' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it('uncertain result retains original retry identity and never retries or revalidates', async () => {
    vi.mocked(relay.relayLegacyAdminAssignment).mockResolvedValueOnce({
      status: 'indeterminate',
      operationId,
    });
    expect(await assignClaimCore(params)).toMatchObject({
      success: false,
      status: 'indeterminate',
      operationId,
    });
    expect(relay.relayLegacyAdminAssignment).toHaveBeenCalledTimes(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
