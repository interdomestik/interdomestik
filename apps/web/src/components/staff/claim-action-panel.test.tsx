import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCommercialHandlingScopeSnapshot } from '@interdomestik/domain-claims/staff-claims/commercial-handling-scope';
import { ClaimActionPanel } from './claim-action-panel';

const routerMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

const actionMocks = vi.hoisted(() => ({
  locale: 'en',
  assignClaim: vi.fn().mockResolvedValue({ success: true }),
  saveRecoveryDecision: vi.fn().mockResolvedValue({ success: true }),
  saveClaimEscalationAgreement: vi.fn().mockResolvedValue({ success: true }),
  saveSuccessFeeCollection: vi.fn().mockResolvedValue({ success: true }),
  updateClaimStatus: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: routerMocks.refresh,
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    return (key: string, values?: Record<string, string | number>) => {
      const locale = actionMocks.locale;

      if (namespace === 'claims-tracking.status') {
        const statusTranslations: Record<string, Record<string, string>> = {
          en: {
            submitted: 'Submitted',
            negotiation: 'Negotiation',
            court: 'Court',
            rejected: 'Rejected',
            evaluation: 'Evaluation',
          },
          sq: {
            submitted: 'Dorëzuar',
            negotiation: 'Negociim',
            court: 'Gjykatë',
            rejected: 'Refuzuar',
            evaluation: 'Vlerësim',
          },
        };

        return statusTranslations[locale]?.[key] ?? key;
      }

      const en: Record<string, string> = {
        'staff_actions.title': 'Staff Actions',
        'staff_actions.common.pending': 'Pending',
        'staff_actions.common.ready': 'Ready',
        'staff_actions.common.missing': 'Missing',
        'staff_actions.common.not_recorded': 'Not recorded',
        'staff_actions.common.yes': 'Yes',
        'staff_actions.common.no': 'No',
        'staff_actions.assignment.title': 'Assignment',
        'staff_actions.assignment.assign_claim': 'Assign claim',
        'staff_actions.assignment.save': 'Save Assignment',
        'staff_actions.assignment.current_assignee': 'Current assignee',
        'staff_actions.assignment.out_of_scope': '{name} (out of scope)',
        'staff_actions.assignment.unassigned': 'Unassigned',
        'staff_actions.assignment.assigned_to_you': 'Assigned to you',
        'staff_actions.assignment.assigned_to_named': 'Assigned to {name}',
        'staff_actions.assignment.assigned_to_colleague': 'Assigned to colleague',
        'staff_actions.recovery_decision.title': 'Recovery Decision',
        'staff_actions.recovery_decision.description':
          'Staff must explicitly accept or decline the recovery matter before negotiation or court work can start.',
        'staff_actions.recovery_decision.summary_status': 'Decision status',
        'staff_actions.recovery_decision.summary_decline_category': 'Decline category',
        'staff_actions.recovery_decision.summary_explanation': 'Decision explanation',
        'staff_actions.recovery_decision.explanation_label': 'Decision explanation',
        'staff_actions.staff_only': 'Staff only',
        'staff_actions.recovery_decision.explanation_placeholder':
          'Record the staff-only reasoning behind the acceptance or decline decision...',
        'staff_actions.recovery_decision.accept': 'Accept Recovery Matter',
        'staff_actions.recovery_decision.decline_category_label': 'Decline category',
        'staff_actions.recovery_decision.decline_category_placeholder': 'Select decline category',
        'staff_actions.recovery_decision.decline': 'Decline Recovery Matter',
        'staff_actions.recovery_decision.decline_reasons.guidance_only_scope':
          'Guidance-only or referral-only under current scope',
        'staff_actions.recovery_decision.decline_reasons.insufficient_evidence':
          'Insufficient evidence for staff-led recovery',
        'staff_actions.recovery_decision.decline_reasons.no_monetary_recovery_path':
          'No clear monetary recovery path',
        'staff_actions.recovery_decision.decline_reasons.counterparty_unidentified':
          'Counterparty or insurer cannot be identified',
        'staff_actions.recovery_decision.decline_reasons.time_limit_risk':
          'Time-limit risk blocks staff-led recovery',
        'staff_actions.recovery_decision.decline_reasons.conflict_or_integrity_concern':
          'Conflict of interest or integrity concern',
        'staff_actions.recovery_prerequisites.title': 'Accepted recovery prerequisites',
        'staff_actions.recovery_prerequisites.description':
          'Accepted recovery cannot move into negotiation or court until both prerequisites are ready.',
        'staff_actions.recovery_prerequisites.agreement': 'Agreement',
        'staff_actions.recovery_prerequisites.collection_path': 'Collection path',
        'staff_actions.success.title': 'Success',
        'staff_actions.error.title': 'Error',
        'staff_actions.success.assignment_self': 'Claim assigned to you',
        'staff_actions.success.assignment_named': 'Claim assigned to {name}',
        'staff_actions.success.assignment_updated': 'Claim assignment updated',
        'staff_actions.success.agreement_saved': 'Escalation agreement saved',
        'staff_actions.success.recovery_accepted': 'Recovery matter accepted',
        'staff_actions.success.recovery_declined': 'Recovery matter declined',
        'staff_actions.success.status_updated': 'Claim status updated',
        'staff_actions.success.collection_saved': 'Success-fee collection saved',
        'staff_actions.validation.recovered_amount_positive':
          'Recovered amount must be a positive number.',
        'staff_actions.commercial_scope.title': 'Launch scope restriction',
        'staff_actions.escalation_agreement.title': 'Escalation Agreement',
        'staff_actions.escalation_agreement.description':
          'Record commercial terms here after the recovery decision is accepted. This agreement detail does not replace the explicit recovery decision above.',
        'staff_actions.escalation_agreement.accepted_next_state': 'Accepted next state',
        'staff_actions.escalation_agreement.accepted_next_state_placeholder':
          'Select accepted next state',
        'staff_actions.escalation_agreement.decision_reason': 'Decision reason',
        'staff_actions.escalation_agreement.decision_reason_placeholder':
          'Record why staff accepted this escalation path...',
        'staff_actions.escalation_agreement.fee': 'Fee',
        'staff_actions.escalation_agreement.fee_percentage': 'Fee percentage',
        'staff_actions.escalation_agreement.minimum_fee': 'Minimum fee',
        'staff_actions.escalation_agreement.minimum_fee_input': 'Minimum fee (EUR)',
        'staff_actions.escalation_agreement.legal_action_cap': 'Legal-action cap',
        'staff_actions.escalation_agreement.payment_authorization': 'Payment authorization',
        'staff_actions.escalation_agreement.payment_authorization_placeholder':
          'Select authorization state',
        'staff_actions.escalation_agreement.payment_authorization_options.pending': 'Pending',
        'staff_actions.escalation_agreement.payment_authorization_options.authorized': 'Authorized',
        'staff_actions.escalation_agreement.payment_authorization_options.revoked': 'Revoked',
        'staff_actions.escalation_agreement.terms_version': 'Terms version',
        'staff_actions.escalation_agreement.signed': 'Signed',
        'staff_actions.escalation_agreement.save': 'Save Escalation Agreement',
        'staff_actions.escalation_agreement.empty': 'No escalation agreement saved for this claim.',
        'staff_actions.escalation_agreement.empty_requires_save':
          'Save the accepted escalation agreement before moving this case into negotiation or court.',
        'staff_actions.success_fee.title': 'Success-Fee Collection',
        'staff_actions.success_fee.description':
          'Record the recovered amount and let the commercial rules resolve deduction first where allowed, then stored payment method, then invoice due within 7 days.',
        'staff_actions.success_fee.recovered_amount': 'Recovered amount',
        'staff_actions.success_fee.success_fee': 'Success fee',
        'staff_actions.success_fee.collection_method': 'Collection method',
        'staff_actions.success_fee.stored_payment_method': 'Stored payment method',
        'staff_actions.success_fee.invoice_due': 'Invoice due',
        'staff_actions.success_fee.resolved': 'Resolved',
        'staff_actions.success_fee.deduct_from_payout': 'Deduct from payout?',
        'staff_actions.success_fee.collection_path_placeholder': 'Select collection path',
        'staff_actions.success_fee.empty':
          'No success-fee collection order has been recorded for this claim.',
        'staff_actions.success_fee.empty_requires_save':
          'No success-fee collection path is recorded yet. Save one before moving this accepted case into negotiation or court.',
        'staff_actions.success_fee.locked_without_agreement':
          'Save the escalation agreement first to unlock success-fee collection.',
        'staff_actions.success_fee.collection_method_options.deduction': 'Deduct from payout',
        'staff_actions.success_fee.collection_method_options.payment_method_charge':
          'Charge stored payment method',
        'staff_actions.success_fee.collection_method_options.invoice': 'Invoice fallback',
        'staff_actions.success_fee.deduction_path_options.allowed':
          'Yes, deduction is legally allowed',
        'staff_actions.success_fee.deduction_path_options.fallback': 'No, use fallback order',
        'staff_actions.success_fee.save': 'Save Success-Fee Collection',
        'staff_actions.status_update.title': 'Update Status',
        'staff_actions.status_update.select_status': 'Select status',
        'staff_actions.status_update.note_label': 'Status Note',
        'staff_actions.status_update.visible_to_member': 'Visible to member',
        'staff_actions.status_update.note_placeholder': 'Reason for status change...',
        'staff_actions.status_update.requires_recovery_decision':
          'Accept the recovery matter above before moving the case into negotiation or court.',
        'staff_actions.status_update.requires_escalation_agreement':
          'Save the accepted escalation agreement before moving this case into negotiation or court.',
        'staff_actions.status_update.requires_collection_path':
          'Save the success-fee collection path before moving this accepted case into negotiation or court.',
        'staff_actions.status_update.allowance_override_reason': 'Allowance override reason',
        'staff_actions.status_update.allowance_override_description':
          'If the member has exhausted annual matter allowance, record the internal override reason here or upgrade coverage before staff-led recovery begins.',
        'staff_actions.status_update.allowance_override_placeholder':
          'Explain why recovery should begin despite exhausted allowance...',
        'staff_actions.status_update.save': 'Update Claim',
      };

      const sq: Record<string, string> = {
        'staff_actions.title': 'Veprimet e stafit',
        'staff_actions.common.pending': 'Në pritje',
        'staff_actions.common.ready': 'Gati',
        'staff_actions.common.missing': 'Mungon',
        'staff_actions.common.not_recorded': 'Nuk është regjistruar',
        'staff_actions.common.yes': 'Po',
        'staff_actions.common.no': 'Jo',
        'staff_actions.assignment.title': 'Caktimi',
        'staff_actions.assignment.assign_claim': 'Cakto rastin',
        'staff_actions.assignment.save': 'Ruaj caktimin',
        'staff_actions.assignment.current_assignee': 'Përgjegjësi aktual',
        'staff_actions.assignment.out_of_scope': '{name} (jashtë fushës)',
        'staff_actions.assignment.unassigned': 'Pa përgjegjës',
        'staff_actions.assignment.assigned_to_you': 'Caktuar te ju',
        'staff_actions.assignment.assigned_to_named': 'Caktuar te {name}',
        'staff_actions.assignment.assigned_to_colleague': 'Caktuar te kolegu',
        'staff_actions.recovery_decision.title': 'Vendimi i rikuperimit',
        'staff_actions.recovery_decision.description':
          'Stafi duhet ta pranojë ose refuzojë qartë çështjen e rikuperimit përpara se të fillojnë negociatat ose gjykata.',
        'staff_actions.recovery_decision.summary_status': 'Statusi i vendimit',
        'staff_actions.recovery_decision.summary_decline_category': 'Kategoria e refuzimit',
        'staff_actions.recovery_decision.summary_explanation': 'Shpjegimi i vendimit',
        'staff_actions.recovery_decision.explanation_label': 'Shpjegimi i vendimit',
        'staff_actions.staff_only': 'Vetëm për stafin',
        'staff_actions.recovery_decision.explanation_placeholder':
          'Regjistro arsyetimin vetëm për stafin pas pranimit ose refuzimit...',
        'staff_actions.recovery_decision.accept': 'Prano çështjen e rikuperimit',
        'staff_actions.recovery_decision.decline_category_label': 'Kategoria e refuzimit',
        'staff_actions.recovery_decision.decline_category_placeholder':
          'Zgjidh kategorinë e refuzimit',
        'staff_actions.recovery_decision.decline': 'Refuzo çështjen e rikuperimit',
        'staff_actions.recovery_decision.decline_reasons.guidance_only_scope':
          'Vetëm këshillim ose referim sipas fushës aktuale',
        'staff_actions.success.title': 'Sukses',
        'staff_actions.error.title': 'Gabim',
        'staff_actions.success.assignment_self': 'Rasti u caktua te ju',
        'staff_actions.success.assignment_named': 'Rasti u caktua te {name}',
        'staff_actions.success.assignment_updated': 'Caktimi i rastit u përditësua',
        'staff_actions.success.agreement_saved': 'Marrëveshja e përshkallëzimit u ruajt',
        'staff_actions.success.recovery_accepted': 'Çështja e rikuperimit u pranua',
        'staff_actions.success.recovery_declined': 'Çështja e rikuperimit u refuzua',
        'staff_actions.success.status_updated': 'Statusi i rastit u përditësua',
        'staff_actions.success.collection_saved': 'Mbledhja e tarifës së suksesit u ruajt',
        'staff_actions.validation.recovered_amount_positive':
          'Shuma e rikuperuar duhet të jetë numër pozitiv.',
        'staff_actions.commercial_scope.title': 'Kufizimi i fushës së lançimit',
        'staff_actions.recovery_prerequisites.title': 'Parakushtet e rikuperimit të pranuar',
        'staff_actions.recovery_prerequisites.description':
          'Rikuperimi i pranuar nuk mund të kalojë në negociata ose gjykatë derisa të jenë gati të dy parakushtet.',
        'staff_actions.recovery_prerequisites.agreement': 'Marrëveshja',
        'staff_actions.recovery_prerequisites.collection_path': 'Rruga e mbledhjes',
        'staff_actions.success_fee.title': 'Mbledhja e tarifës së suksesit',
        'staff_actions.success_fee.recovered_amount': 'Shuma e rikuperuar',
        'staff_actions.success_fee.save': 'Ruaj mbledhjen e tarifës së suksesit',
      };

      const translations = locale === 'sq' ? sq : en;
      const template = translations[key] ?? key;

      if (!values) return template;
      return Object.entries(values).reduce(
        (result, [name, value]) => result.replace(`{${name}}`, String(value)),
        template
      );
    };
  },
}));

vi.mock('@/actions/staff-claims.core', () => ({
  assignClaim: actionMocks.assignClaim,
  saveRecoveryDecision: actionMocks.saveRecoveryDecision,
  saveClaimEscalationAgreement: actionMocks.saveClaimEscalationAgreement,
  saveSuccessFeeCollection: actionMocks.saveSuccessFeeCollection,
  updateClaimStatus: actionMocks.updateClaimStatus,
}));

vi.mock('@interdomestik/ui', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

beforeEach(() => {
  vi.clearAllMocks();
  actionMocks.locale = 'en';
  actionMocks.assignClaim.mockResolvedValue({ success: true });
  actionMocks.saveRecoveryDecision.mockResolvedValue({ success: true });
  actionMocks.saveClaimEscalationAgreement.mockResolvedValue({ success: true });
  actionMocks.saveSuccessFeeCollection.mockResolvedValue({ success: true });
  actionMocks.updateClaimStatus.mockResolvedValue({ success: true });
});

describe('ClaimActionPanel', () => {
  const assignmentOptions = [
    { id: 'staff-me', label: 'Drita Gashi' },
    { id: 'staff-other', label: 'Agim Ramadani' },
  ] as const;
  const savedAgreement = {
    acceptedAt: '2026-03-12T00:00:00.000Z',
    claimId: 'claim-1',
    decisionNextStatus: 'negotiation' as const,
    decisionReason: 'Member accepted negotiation as the next recovery path.',
    feePercentage: 25,
    legalActionCapPercentage: 40,
    minimumFee: '25.00',
    paymentAuthorizationState: 'authorized' as const,
    signedAt: '2026-03-12T00:00:00.000Z',
    termsVersion: 'v1',
  };
  const pendingRecoveryDecision = {
    status: 'pending' as const,
    decidedAt: null,
    explanation: null,
    declineReasonCode: null,
    staffLabel: 'Pending staff decision',
    memberLabel: null,
    memberDescription: null,
  };
  const acceptedRecoveryDecision = {
    ...pendingRecoveryDecision,
    status: 'accepted' as const,
    explanation: 'Clear insurer path and viable monetary recovery.',
    staffLabel: 'Accepted for staff-led recovery',
    memberLabel: 'Accepted for staff-led recovery',
    memberDescription: 'We accepted this matter for staff-led recovery.',
  };
  const eligibleCommercialScope = buildCommercialHandlingScopeSnapshot({
    claimCategory: 'vehicle',
  });
  const pendingAcceptedRecoveryPrerequisites = {
    agreementReady: false,
    canMoveForward: false,
    collectionPathReady: false,
    commercialScope: eligibleCommercialScope,
    isAcceptedRecoveryDecision: false,
  };
  const readyAcceptedRecoveryPrerequisites = {
    agreementReady: true,
    canMoveForward: true,
    collectionPathReady: true,
    commercialScope: eligibleCommercialScope,
    isAcceptedRecoveryDecision: true,
  };
  const missingCollectionAcceptedRecoveryPrerequisites = {
    agreementReady: true,
    canMoveForward: false,
    collectionPathReady: false,
    commercialScope: eligibleCommercialScope,
    isAcceptedRecoveryDecision: true,
  };
  const blockedCommercialScopeAcceptedRecoveryPrerequisites = {
    agreementReady: true,
    canMoveForward: false,
    collectionPathReady: false,
    commercialScope: buildCommercialHandlingScopeSnapshot({
      claimCategory: 'travel',
    }),
    isAcceptedRecoveryDecision: true,
  };
  const invoiceFallbackSuccessFeeCollection = {
    claimId: 'claim-1',
    collectionMethod: 'invoice' as const,
    currencyCode: 'EUR',
    deductionAllowed: false,
    feeAmount: '50.00',
    hasStoredPaymentMethod: false,
    invoiceDueAt: '2026-03-20T00:00:00.000Z',
    paymentAuthorizationState: 'authorized' as const,
    recoveredAmount: '200.00',
    resolvedAt: null,
    subscriptionId: null,
  };

  function renderPanel(overrides: Partial<React.ComponentProps<typeof ClaimActionPanel>> = {}) {
    render(
      <ClaimActionPanel
        acceptedRecoveryPrerequisites={pendingAcceptedRecoveryPrerequisites}
        assigneeId={null}
        assignmentOptions={assignmentOptions}
        claimId="claim-1"
        commercialAgreement={null}
        currentStatus="submitted"
        recoveryDecision={pendingRecoveryDecision}
        staffId="staff-me"
        successFeeCollection={null}
        {...overrides}
      />
    );
  }

  it('submits a selected staff assignment manually', async () => {
    render(
      <ClaimActionPanel
        acceptedRecoveryPrerequisites={pendingAcceptedRecoveryPrerequisites}
        assigneeId={null}
        assignmentOptions={assignmentOptions}
        claimId="claim-1"
        commercialAgreement={null}
        currentStatus="submitted"
        recoveryDecision={pendingRecoveryDecision}
        staffId="staff-me"
        successFeeCollection={null}
      />
    );

    fireEvent.change(screen.getByTestId('staff-assignment-select'), {
      target: { value: 'staff-other' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Assignment' }));

    await waitFor(() => {
      expect(actionMocks.assignClaim).toHaveBeenCalledWith('claim-1', 'staff-other');
    });
  });

  it('localizes visible action-panel copy on non-English routes', () => {
    actionMocks.locale = 'sq';

    renderPanel();

    expect(screen.getByText('Veprimet e stafit')).toBeInTheDocument();
    expect(screen.getByText('Caktimi')).toBeInTheDocument();
    expect(screen.getByLabelText('Cakto rastin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ruaj caktimin' })).toBeInTheDocument();
    expect(screen.getByText('Vendimi i rikuperimit')).toBeInTheDocument();
    expect(screen.getByText('Prano çështjen e rikuperimit')).toBeInTheDocument();
    expect(screen.getByLabelText(/Shpjegimi i vendimit/)).toBeInTheDocument();
  });

  it('renders commercial timestamps in deterministic UTC text', () => {
    renderPanel({
      acceptedRecoveryPrerequisites: readyAcceptedRecoveryPrerequisites,
      commercialAgreement: savedAgreement,
      recoveryDecision: acceptedRecoveryDecision,
      successFeeCollection: invoiceFallbackSuccessFeeCollection,
    });

    expect(screen.getByText('12/03/2026, 00:00 UTC')).toBeInTheDocument();
    expect(screen.getByText('20/03/2026, 00:00 UTC')).toBeInTheDocument();
  });

  it('keeps manual assignment save disabled when selection matches the current assignee', () => {
    render(
      <ClaimActionPanel
        acceptedRecoveryPrerequisites={pendingAcceptedRecoveryPrerequisites}
        assigneeId="staff-other"
        assignmentOptions={assignmentOptions}
        claimId="claim-1"
        commercialAgreement={null}
        currentStatus="submitted"
        recoveryDecision={pendingRecoveryDecision}
        staffId="staff-me"
        successFeeCollection={null}
      />
    );

    expect(screen.getByTestId('staff-assignment-select')).toHaveValue('staff-other');
    expect(screen.getByRole('button', { name: 'Save Assignment' })).toBeDisabled();
  });

  it('preserves an out-of-scope current assignee until staff pick a new in-scope option', () => {
    render(
      <ClaimActionPanel
        acceptedRecoveryPrerequisites={pendingAcceptedRecoveryPrerequisites}
        assigneeId="staff-out"
        assignmentOptions={assignmentOptions}
        claimId="claim-1"
        commercialAgreement={null}
        currentAssigneeLabel="Outside Staff"
        currentStatus="submitted"
        recoveryDecision={pendingRecoveryDecision}
        staffId="staff-me"
        successFeeCollection={null}
      />
    );

    expect(screen.getByTestId('staff-assignment-select')).toHaveValue('staff-out');
    expect(screen.getByRole('option', { name: 'Outside Staff (out of scope)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save Assignment' })).toBeDisabled();

    fireEvent.change(screen.getByTestId('staff-assignment-select'), {
      target: { value: 'staff-other' },
    });

    expect(screen.getByRole('button', { name: 'Save Assignment' })).toBeEnabled();
  });

  it('keeps success-fee save disabled for non-finite or non-positive recovered amounts', () => {
    render(
      <ClaimActionPanel
        acceptedRecoveryPrerequisites={readyAcceptedRecoveryPrerequisites}
        assigneeId="staff-other"
        assignmentOptions={assignmentOptions}
        claimId="claim-1"
        commercialAgreement={savedAgreement}
        currentStatus="submitted"
        recoveryDecision={acceptedRecoveryDecision}
        staffId="staff-me"
        successFeeCollection={null}
      />
    );

    const recoveredAmountInput = screen.getByLabelText('Recovered amount');
    const saveButton = screen.getByRole('button', { name: 'Save Success-Fee Collection' });

    fireEvent.change(recoveredAmountInput, { target: { value: '1e309' } });
    expect(saveButton).toBeDisabled();

    fireEvent.change(recoveredAmountInput, { target: { value: '0' } });
    expect(saveButton).toBeDisabled();

    fireEvent.change(recoveredAmountInput, { target: { value: '120.50' } });
    expect(saveButton).toBeEnabled();
  });

  it('unlocks success-fee capture immediately after saving a new agreement', async () => {
    actionMocks.saveClaimEscalationAgreement.mockResolvedValueOnce({
      data: savedAgreement,
      success: true,
    });

    render(
      <ClaimActionPanel
        acceptedRecoveryPrerequisites={pendingAcceptedRecoveryPrerequisites}
        assigneeId={null}
        assignmentOptions={assignmentOptions}
        claimId="claim-1"
        commercialAgreement={null}
        currentStatus="submitted"
        recoveryDecision={pendingRecoveryDecision}
        staffId="staff-me"
        successFeeCollection={null}
      />
    );

    expect(
      screen.getByText('Save the escalation agreement first to unlock success-fee collection.')
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Fee percentage'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Legal-action cap'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Terms version'), { target: { value: 'v1' } });
    fireEvent.change(screen.getByLabelText('Decision reason'), {
      target: { value: 'Member accepted negotiation as the next recovery path.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Escalation Agreement' }));

    await waitFor(() => {
      expect(actionMocks.saveClaimEscalationAgreement).toHaveBeenCalledWith(
        expect.objectContaining({
          claimId: 'claim-1',
          decisionNextStatus: 'negotiation',
          decisionReason: 'Member accepted negotiation as the next recovery path.',
        })
      );
    });

    await waitFor(() => {
      expect(
        screen.getByText('No success-fee collection order has been recorded for this claim.')
      ).toBeInTheDocument();
    });

    const recoveredAmountInput = screen.getByLabelText('Recovered amount');
    const saveButton = screen.getByRole('button', { name: 'Save Success-Fee Collection' });

    await waitFor(() => {
      expect(recoveredAmountInput).toBeEnabled();
    });

    fireEvent.change(recoveredAmountInput, { target: { value: '75.00' } });
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });
  });

  it('shows accepted recovery prerequisite completeness when the collection path is still missing', () => {
    render(
      <ClaimActionPanel
        acceptedRecoveryPrerequisites={missingCollectionAcceptedRecoveryPrerequisites}
        assigneeId="staff-me"
        assignmentOptions={assignmentOptions}
        claimId="claim-1"
        commercialAgreement={savedAgreement}
        currentStatus="evaluation"
        recoveryDecision={acceptedRecoveryDecision}
        staffId="staff-me"
        successFeeCollection={null}
      />
    );

    expect(screen.getByText('Accepted recovery prerequisites')).toBeInTheDocument();
    expect(screen.getByText('Agreement')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Collection path')).toBeInTheDocument();
    expect(screen.getByText('Missing')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Accepted recovery cannot move into negotiation or court until both prerequisites are ready.'
      )
    ).toBeInTheDocument();
  });

  it('shows the saved collection fallback summary for accepted recovery claims', () => {
    render(
      <ClaimActionPanel
        acceptedRecoveryPrerequisites={readyAcceptedRecoveryPrerequisites}
        assigneeId="staff-me"
        assignmentOptions={assignmentOptions}
        claimId="claim-1"
        commercialAgreement={savedAgreement}
        currentStatus="evaluation"
        recoveryDecision={acceptedRecoveryDecision}
        staffId="staff-me"
        successFeeCollection={invoiceFallbackSuccessFeeCollection}
      />
    );

    const summary = screen.getByTestId('staff-success-fee-collection-summary');

    expect(summary).toBeInTheDocument();
    expect(within(summary).getByText('EUR 200.00')).toBeInTheDocument();
    expect(within(summary).getByText('Invoice fallback')).toBeInTheDocument();
    expect(within(summary).getByText('No')).toBeInTheDocument();
    expect(within(summary).getByText('2026', { exact: false })).toBeInTheDocument();
  });

  it('shows the launch-scope restriction and keeps commercial actions locked for guidance-only matters', () => {
    renderPanel({
      acceptedRecoveryPrerequisites: blockedCommercialScopeAcceptedRecoveryPrerequisites,
      assigneeId: 'staff-me',
      commercialAgreement: savedAgreement,
      currentStatus: 'evaluation',
      recoveryDecision: acceptedRecoveryDecision,
    });

    expect(screen.getByTestId('staff-commercial-scope-restriction')).toBeInTheDocument();
    expect(screen.getAllByText('Guidance-only or referral-only under current scope')).toHaveLength(
      2
    );
    expect(
      screen.getByText(
        'This matter stays guidance-only or referral-only under the current launch scope.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Escalation Agreement' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Recovered amount'), { target: { value: '120.50' } });
    expect(screen.getByRole('button', { name: 'Save Success-Fee Collection' })).toBeDisabled();
  });

  it('passes an internal allowance override reason when updating a recovery claim', async () => {
    render(
      <ClaimActionPanel
        acceptedRecoveryPrerequisites={readyAcceptedRecoveryPrerequisites}
        assigneeId="staff-me"
        assignmentOptions={assignmentOptions}
        claimId="claim-1"
        commercialAgreement={savedAgreement}
        currentStatus="negotiation"
        recoveryDecision={acceptedRecoveryDecision}
        staffId="staff-me"
        successFeeCollection={null}
      />
    );

    fireEvent.change(screen.getByLabelText(/Status Note/i), {
      target: { value: 'Member asked for a recovery update.' },
    });
    fireEvent.change(screen.getByLabelText(/Allowance override reason/i), {
      target: { value: 'Family upgrade is pending but staff work must start now.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update Claim' }));

    await waitFor(() => {
      expect(actionMocks.updateClaimStatus).toHaveBeenCalledWith(
        'claim-1',
        'negotiation',
        'Member asked for a recovery update.',
        true,
        'Family upgrade is pending but staff work must start now.'
      );
    });
  });

  it('shows the staff recovery decision gate before staff-led recovery starts', () => {
    render(
      <ClaimActionPanel
        acceptedRecoveryPrerequisites={pendingAcceptedRecoveryPrerequisites}
        assigneeId="staff-me"
        assignmentOptions={assignmentOptions}
        claimId="claim-1"
        commercialAgreement={null}
        currentStatus="evaluation"
        recoveryDecision={pendingRecoveryDecision}
        staffId="staff-me"
        successFeeCollection={null}
      />
    );

    expect(screen.getByText('Pending staff decision')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept Recovery Matter' })).toBeInTheDocument();
  });
});
