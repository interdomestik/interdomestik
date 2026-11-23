// @vitest-environment node
import {
  acceptanceMocks,
  memberAuthority,
  memberUser,
} from './member-acceptance-denial.test-support';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { acceptLegalDocuments } from '@/actions/privacy/accept-legal-documents';
import { listMembersWithoutAcceptance } from '@/actions/privacy/list-members-without-acceptance';
import { issueLegalAcceptanceFormToken } from './legal-acceptance-form-token';
import { renderLegalTexts } from './legal-text';
import { currentLegalVersions } from '@interdomestik/domain-privacy/acceptance';

vi.unmock('next-intl');

const domain = vi.hoisted(() => ({
  audit: vi.fn(),
  capture: vi.fn(),
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: domain.capture,
  setUser: vi.fn(),
  setTag: vi.fn(),
}));

vi.mock('@/lib/auth', async () => {
  const { randomUUID } = await import('node:crypto');
  return { auth: { $context: Promise.resolve({ secret: randomUUID() }) } };
});
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: domain.audit }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));

beforeEach(() => domain.audit.mockResolvedValue({ ok: true }));

const renderedInput = {
  locale: 'en',
  documents: [{ kind: 'terms' as const, version: currentLegalVersions.terms }],
  attestations: { termsAccepted: true },
};

let input: typeof renderedInput & { formToken: string };
beforeEach(async () => {
  const rendered = renderLegalTexts(renderedInput.locale, renderedInput.documents);
  if (!rendered.ok) throw new Error('Missing legal text fixture');
  input = {
    ...renderedInput,
    formToken: await issueLegalAcceptanceFormToken(
      memberUser.id,
      renderedInput.locale,
      rendered.texts
    ),
  };
});

describe('legal acceptance and the tenant report', () => {
  it.each([
    { subjectUserId: 'different-user' },
    { tenantId: 'different-tenant' },
    { role: 'tenant_admin' },
  ])('refuses injected identity %o before the domain writer', async identity => {
    await expect(acceptLegalDocuments({ ...input, ...identity })).resolves.toMatchObject({
      success: false,
      code: 'VALIDATION_ERROR',
    });
    expect(acceptanceMocks.recordAcceptance).not.toHaveBeenCalled();
  });

  it('binds a one-document attestation to the session authority and server-rendered text', async () => {
    acceptanceMocks.recordAcceptance.mockResolvedValueOnce({ ok: true });
    const result = await acceptLegalDocuments(input);
    expect(domain.capture).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      data: { accepted: true },
    });
    expect(acceptanceMocks.recordAcceptance).toHaveBeenCalledWith(
      memberAuthority,
      { documents: input.documents, attestations: input.attestations },
      expect.objectContaining({
        locale: 'en',
        texts: expect.arrayContaining([
          expect.objectContaining({
            kind: 'terms',
            version: currentLegalVersions.terms,
            values: expect.arrayContaining([expect.stringContaining('Legal review pending')]),
          }),
        ]),
      })
    );
    expect(acceptanceMocks.readAcceptance).not.toHaveBeenCalled();
  });

  it('refuses a stale rendered version before reading texts or invoking the writer', async () => {
    await expect(
      acceptLegalDocuments({
        ...input,
        documents: [{ kind: 'terms', version: 'previous' }],
      })
    ).resolves.toMatchObject({ success: false, code: 'stale_version' });
    expect(acceptanceMocks.recordAcceptance).not.toHaveBeenCalled();
  });

  it('refuses a supported locale substituted for the locale shown on the form', async () => {
    await expect(acceptLegalDocuments({ ...input, locale: 'de' })).resolves.toMatchObject({
      success: false,
      code: 'legal_text_mismatch',
    });
    expect(acceptanceMocks.recordAcceptance).not.toHaveBeenCalled();
  });

  it('refuses a form signed for another member', async () => {
    acceptanceMocks.authorize.mockResolvedValueOnce({
      authority: memberAuthority,
      session: { user: { ...memberUser, id: 'another-member' } },
    });
    await expect(acceptLegalDocuments(input)).resolves.toMatchObject({
      success: false,
      code: 'legal_text_mismatch',
    });
    expect(acceptanceMocks.recordAcceptance).not.toHaveBeenCalled();
  });

  it('refuses a token when the rendered digest differs from the current text', async () => {
    const formToken = await issueLegalAcceptanceFormToken(memberUser.id, input.locale, [
      { ...input.documents[0], values: ['Previously rendered content'] },
    ]);
    await expect(acceptLegalDocuments({ ...input, formToken })).resolves.toMatchObject({
      success: false,
      code: 'legal_text_mismatch',
    });
    expect(acceptanceMocks.recordAcceptance).not.toHaveBeenCalled();
  });

  it('refuses a locale outside the supported catalogue', async () => {
    await expect(acceptLegalDocuments({ ...input, locale: 'fr' })).resolves.toMatchObject({
      success: false,
      code: 'VALIDATION_ERROR',
    });
    expect(acceptanceMocks.recordAcceptance).not.toHaveBeenCalled();
  });

  it('refuses the tenant report to a member before reading it', async () => {
    await expect(listMembersWithoutAcceptance({})).resolves.toMatchObject({
      success: false,
      code: 'FORBIDDEN',
    });
    expect(acceptanceMocks.listMissingAcceptance).not.toHaveBeenCalled();
  });
});
