import { beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ create: vi.fn(), revalidate: vi.fn(), context: vi.fn() }));
vi.mock('@interdomestik/domain-claims', () => ({ createInformationRequest: h.create }));
vi.mock('next/cache', () => ({ revalidatePath: h.revalidate }));
vi.mock('./context', () => ({ getActionContext: h.context }));
import { createClaimInformationRequest } from './information-request';
beforeEach(() => vi.clearAllMocks());
it('obtains the session server-side and refreshes both mounted routes in four locales', async () => {
  const session = { user: { id: 'staff' } };
  const input = { claimId: 'claim-1' };
  h.context.mockResolvedValue({ session });
  h.create.mockResolvedValue({ success: true, requestId: 'request-1' });
  await createClaimInformationRequest(input);
  expect(h.create).toHaveBeenCalledWith(session, input);
  expect(h.revalidate.mock.calls.map(([path]) => path).sort()).toEqual(
    ['en', 'mk', 'sq', 'sr']
      .flatMap(locale => [`/${locale}/member/claims/claim-1`, `/${locale}/staff/claims/claim-1`])
      .sort()
  );
});
it('returns a denied result without cache mutation', async () => {
  h.context.mockResolvedValue({ session: null });
  h.create.mockResolvedValue({ success: false, error: 'access_denied' });
  expect(await createClaimInformationRequest({})).toEqual({
    success: false,
    error: 'access_denied',
  });
  expect(h.revalidate).not.toHaveBeenCalled();
});
