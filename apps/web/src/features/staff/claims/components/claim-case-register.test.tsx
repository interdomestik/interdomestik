import catalog from '@/messages/en/staff-correspondence.json';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimAuthoritiesPanel } from './ClaimAuthoritiesPanel';
import { ClaimCaseFieldsPanel } from './ClaimCaseFieldsPanel';
import { ClaimCorrespondenceForm } from './ClaimCorrespondenceForm';
import { ClaimCorrespondenceList } from './ClaimCorrespondenceList';
import { RegisterReadError } from './case-register-controls';
import {
  claimId,
  occurredAt,
  documents,
  recovery,
  representation,
  consent,
  outbound,
} from './claim-case-register.test-fixture';

const action = vi.hoisted(() => ({
  refresh: vi.fn(),
  fields: vi.fn(),
  record: vi.fn(),
  revoke: vi.fn(),
  inbound: vi.fn(),
  outbound: vi.fn(),
  followUp: vi.fn(),
}));

vi.unmock('next-intl');
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: action.refresh }) }));
vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    className,
  }: {
    children: ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
vi.mock('@/actions/staff-claims/case-authorities', () => ({
  recordCaseAuthority: action.record,
  revokeCaseAuthority: action.revoke,
  updateGreenCardCaseFields: action.fields,
}));
vi.mock('@/actions/staff-claims/correspondence', () => ({
  recordInboundCorrespondence: action.inbound,
  recordOutboundCorrespondence: action.outbound,
  setCorrespondenceFollowUp: action.followUp,
}));

const copy = catalog['staff-correspondence'];
function show(view: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={catalog}>
      {view}
    </NextIntlClientProvider>
  );
}

function set(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
}

function submit(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

function enterContact() {
  set(copy.entry.occurredUtc, '2026-01-02T12:30');
  set(copy.entry.organisation, 'Synthetic insurer');
  set(copy.entry.body, 'Synthetic reply');
}

beforeEach(() => {
  vi.resetAllMocks();
  for (const mock of [
    action.fields,
    action.record,
    action.revoke,
    action.inbound,
    action.outbound,
    action.followUp,
  ]) {
    mock.mockResolvedValue({ success: true });
  }
});

describe('case details', () => {
  const fields = {
    otherVehicleCountryCode: null,
    insuranceProofReference: 'Sample reference',
    outsideHandlingParty: null,
    coverageVerificationStatus: 'not_checked' as const,
    caseFollowUpAt: null,
  };

  it('retains inputs during a pending save and retries a typed failure', async () => {
    type Failure = { success: false; code: string };
    let resolveSave!: (failure: Failure) => void;
    action.fields.mockReturnValueOnce(
      new Promise<Failure>(resolve => {
        resolveSave = resolve;
      })
    );
    show(<ClaimCaseFieldsPanel claimId={claimId} canWrite fields={fields} />);
    set(copy.caseFields.country, 'de');
    set(copy.caseFields.coverage, 'requested');
    set(copy.caseFields.caseFollowUpUtc, '2026-01-02T12:30');
    submit(copy.caseFields.save);
    expect(screen.getByRole('status')).toHaveTextContent(copy.feedback.saving);
    expect(screen.getByRole('button', { name: copy.caseFields.save })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    submit(copy.caseFields.save);
    expect(action.fields).toHaveBeenCalledExactlyOnceWith({
      claimId,
      ...fields,
      otherVehicleCountryCode: 'DE',
      coverageVerificationStatus: 'requested',
      caseFollowUpAt: occurredAt,
      expected: fields,
    });
    await act(() => {
      resolveSave({ success: false, code: 'invalid_state' });
      return Promise.resolve();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(copy.feedback.invalidState);
    expect(screen.getByLabelText(copy.caseFields.country)).toHaveValue('de');
    expect(action.refresh).not.toHaveBeenCalled();
    submit(copy.caseFields.save);
    expect(await screen.findByText(copy.feedback.saved)).toBeVisible();
    expect(action.refresh).toHaveBeenCalledOnce();
  });

  it('shows saved details without an editor for a read-only staff viewer', () => {
    show(<ClaimCaseFieldsPanel claimId={claimId} canWrite={false} fields={fields} />);
    expect(screen.getByText(fields.insuranceProofReference)).toBeVisible();
    expect(screen.queryByRole('button', { name: copy.caseFields.save })).not.toBeInTheDocument();
  });
});

describe('authorizations', () => {
  it('requires a jurisdiction confirmation and records only the checkbox literal', async () => {
    show(
      <ClaimAuthoritiesPanel claimId={claimId} canWrite authorities={[]} documents={documents} />
    );
    expect(screen.getByText(copy.authorities.empty)).toBeVisible();
    set(copy.authorities.kind, 'power_of_attorney');
    set(copy.authorities.instrument, 'doc-a');
    set(copy.authorities.version, 'v1');
    set(copy.authorities.grantedUtc, '2026-01-02T12:30');
    set(copy.authorities.jurisdiction, 'de');
    submit(copy.authorities.record);
    expect(action.record).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: copy.authorities.attestJurisdiction }));
    submit(copy.authorities.record);
    expect(await screen.findByText(copy.feedback.saved)).toBeVisible();
    expect(action.record).toHaveBeenCalledExactlyOnceWith({
      claimId,
      kind: 'power_of_attorney',
      evidenceDocumentId: 'doc-a',
      version: 'v1',
      grantedAt: occurredAt,
      expiresAt: null,
      jurisdictionCountryCode: 'DE',
      jurisdictionAppropriateConfirmed: true,
      purpose: undefined,
      correlationId: expect.any(String),
    });
  });

  it('records a consent purpose and requires explicit confirmation to revoke', async () => {
    show(
      <ClaimAuthoritiesPanel
        claimId={claimId}
        canWrite
        authorities={[recovery]}
        documents={documents}
      />
    );
    set(copy.authorities.kind, 'consent_or_lawful_basis');
    set(copy.authorities.instrument, 'doc-a');
    set(copy.authorities.version, 'v2');
    set(copy.authorities.grantedUtc, '2026-01-02T12:30');
    set(copy.authorities.purpose, 'Sharing purpose');
    submit(copy.authorities.record);
    expect(await screen.findByText(copy.feedback.saved)).toBeVisible();
    expect(action.record).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'Sharing purpose' })
    );
    const revoke = screen.getByText(copy.authorities.revoke);
    expect(revoke.closest('details')).not.toHaveAttribute('open');
    expect(action.revoke).not.toHaveBeenCalled();
    fireEvent.click(revoke);
    expect(revoke.closest('details')).toHaveAttribute('open');
    expect(screen.getByText(copy.authorities.revokeLimit)).toBeVisible();
    submit(copy.authorities.confirmRevoke);
    expect(action.revoke).toHaveBeenCalledExactlyOnceWith({ claimId, authorityId: recovery.id });
    expect(await within(revoke.closest('li')!).findByText(copy.feedback.saved)).toBeVisible();
  });
});

describe('correspondence', () => {
  it('records an inbound reply and reuses its correlation id after transport failure', async () => {
    action.inbound.mockRejectedValueOnce(new Error('connection interrupted'));
    show(
      <ClaimCorrespondenceForm
        claimId={claimId}
        authorities={[]}
        documents={[]}
        entries={[outbound]}
      />
    );
    enterContact();
    set(copy.entry.replyTo, outbound.id);
    submit(copy.entry.record);
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.feedback.failed);
    submit(copy.entry.record);
    expect(await screen.findByText(copy.feedback.saved)).toBeVisible();
    const request = action.inbound.mock.calls[0]?.[0];
    expect(request).toEqual({
      claimId,
      inReplyToId: outbound.id,
      partyKind: 'insurer',
      partyOrganisation: 'Synthetic insurer',
      occurredAt,
      body: 'Synthetic reply',
      channel: 'email',
      partyReference: null,
      partyContactName: null,
      correlationId: expect.stringMatching(/^[a-f\d-]{36}$/),
    });
    expect(action.inbound).toHaveBeenNthCalledWith(2, request);
    expect(action.outbound).not.toHaveBeenCalled();
  });

  it('requires a disclosure confirmation when selecting a sent document', async () => {
    show(
      <ClaimCorrespondenceForm
        claimId={claimId}
        authorities={[recovery, representation, consent]}
        documents={documents}
        entries={[]}
      />
    );
    set(copy.entry.directionLabel, 'outbound');
    enterContact();
    set(copy.authorities.kinds.recovery_agreement, recovery.id);
    set(copy.authorities.kinds.power_of_attorney, representation.id);
    fireEvent.click(screen.getByRole('checkbox', { name: documents[0].name }));
    set(copy.authorities.kinds.consent_or_lawful_basis, consent.id);
    submit(copy.entry.record);
    expect(action.outbound).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: copy.entry.attestSharing }));
    submit(copy.entry.record);
    expect(await screen.findByText(copy.feedback.saved)).toBeVisible();
    expect(action.outbound).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        claimId,
        sharedDocumentIds: [documents[0].id],
        recoveryAuthorityId: recovery.id,
        representationAuthorityId: representation.id,
        sharingAuthorityId: consent.id,
        sharingCoveredByConsentConfirmed: true,
      })
    );
  });

  it('renders answered and overdue separately and submits the original follow-up for compare-and-set', async () => {
    action.followUp.mockResolvedValueOnce({ success: false, code: 'conflict' });
    show(
      <ClaimCorrespondenceList
        claimId={claimId}
        canWrite
        entries={[outbound, { ...outbound, id: 'contact-b', answered: true, overdue: false }]}
        documents={[]}
      />
    );
    const row = within(screen.getAllByTestId('staff-correspondence-entry')[0]!);
    expect(screen.getAllByTestId('staff-correspondence-overdue')).toHaveLength(1);
    expect(screen.getByTestId('staff-correspondence-answered')).toBeVisible();
    fireEvent.change(row.getByLabelText(copy.list.followUpUtc), { target: { value: '' } });
    fireEvent.click(row.getByRole('button', { name: copy.list.saveFollowUp }));
    expect(await row.findByRole('alert')).toHaveTextContent(copy.feedback.conflict);
    expect(action.followUp).toHaveBeenCalledExactlyOnceWith({
      claimId,
      correspondenceId: outbound.id,
      expectedFollowUpAt: outbound.followUpAt,
      followUpAt: null,
    });
    expect(action.refresh).toHaveBeenCalledOnce();
  });

  it('shows an admitted empty register and offers a retry for a separate failed read', () => {
    const view = show(
      <ClaimCorrespondenceList claimId={claimId} canWrite={false} entries={[]} documents={[]} />
    );
    expect(screen.getByText(copy.list.empty)).toBeVisible();
    view.unmount();
    show(<RegisterReadError />);
    expect(screen.getByRole('alert')).toHaveTextContent(copy.feedback.readFailed);
    submit(copy.feedback.retry);
    expect(action.refresh).toHaveBeenCalledOnce();
    expect(screen.queryByText(copy.list.empty)).not.toBeInTheDocument();
  });

  it('pages a long register with previous and next links that keep the case', () => {
    show(
      <ClaimCorrespondenceList
        claimId={claimId}
        canWrite={false}
        entries={[outbound]}
        documents={[]}
        page={2}
        perPage={20}
        total={45}
      />
    );
    const pages = screen.getByRole('navigation', { name: copy.list.pages });
    expect(within(pages).getByText('Page 2 of 3')).toHaveAttribute('aria-current', 'page');
    expect(within(pages).getByRole('link', { name: copy.list.previous })).toHaveAttribute(
      'href',
      expect.stringContaining(`/staff/claims/${claimId}?correspondencePage=1`)
    );
    expect(within(pages).getByRole('link', { name: copy.list.next })).toHaveAttribute(
      'href',
      expect.stringContaining(`/staff/claims/${claimId}?correspondencePage=3`)
    );
  });

  it('shows no page links when the register fits on one page', () => {
    show(
      <ClaimCorrespondenceList
        claimId={claimId}
        canWrite={false}
        entries={[outbound]}
        documents={[]}
        page={1}
        perPage={20}
        total={1}
      />
    );
    expect(screen.queryByRole('navigation', { name: copy.list.pages })).not.toBeInTheDocument();
  });
});
