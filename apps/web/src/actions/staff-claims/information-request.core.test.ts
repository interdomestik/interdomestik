import { beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({
  acknowledge: vi.fn(),
  context: vi.fn(),
  create: vi.fn(),
  fulfil: vi.fn(),
  parseAcknowledge: vi.fn(),
  parseCreate: vi.fn(),
  parseFulfil: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('@interdomestik/domain-claims', () => ({
  acknowledgeInformationRequestEvidence: h.acknowledge,
  acknowledgeInformationRequestEvidenceInput: { safeParse: h.parseAcknowledge },
  createInformationRequest: h.create,
  fulfilInformationRequest: h.fulfil,
  fulfilInformationRequestInput: { safeParse: h.parseFulfil },
  informationRequestInput: { safeParse: h.parseCreate },
}));
vi.mock('next/cache', () => ({ revalidatePath: h.revalidate }));
vi.mock('./context', () => ({ getActionContext: h.context }));
import {
  acknowledgeClaimInformationRequestEvidence,
  createClaimInformationRequest,
  fulfilClaimInformationRequest,
} from './information-request';
beforeEach(() => {
  vi.clearAllMocks();
  h.parseCreate.mockImplementation(input => ({ success: true, data: input }));
  h.parseAcknowledge.mockImplementation(input => ({ success: true, data: input }));
  h.parseFulfil.mockImplementation(input => ({ success: true, data: input }));
});
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

it('refreshes both mounted routes after assigned staff acknowledges evidence', async () => {
  const session = { user: { id: 'staff' } };
  const input = { claimId: 'claim-1', evidenceId: 'evidence-1' };
  h.context.mockResolvedValue({ session });
  h.acknowledge.mockResolvedValue({ success: true, acknowledgedAt: new Date() });

  await acknowledgeClaimInformationRequestEvidence(input);

  expect(h.acknowledge).toHaveBeenCalledWith(session, input);
  expect(h.revalidate).toHaveBeenCalledTimes(8);
});

it('refreshes member and staff views only after fulfilment succeeds', async () => {
  const session = { user: { id: 'staff' } };
  const input = {
    claimId: 'claim-1',
    requestId: 'request-1',
    documentId: 'document-1',
    reviewed: true,
  };
  h.context.mockResolvedValue({ session });
  h.fulfil.mockResolvedValueOnce({ success: false, error: 'conflict' });
  await expect(fulfilClaimInformationRequest(input)).resolves.toEqual({
    success: false,
    error: 'conflict',
  });
  expect(h.revalidate).not.toHaveBeenCalled();
  h.fulfil.mockResolvedValueOnce({ success: true, fulfilledAt: '2026-09-17T11:00:00.000Z' });
  await fulfilClaimInformationRequest(input);
  expect(h.fulfil).toHaveBeenCalledWith(session, input);
  expect(h.revalidate).toHaveBeenCalledTimes(8);
});
