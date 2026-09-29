import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import type { RecoveryDeclineReasonCode } from '@/actions/staff-claims.core';
import enAgent from '@/messages/en/agent-claims.json';
import enClaims from '@/messages/en/claims.json';
import mkAgent from '@/messages/mk/agent-claims.json';
import mkClaims from '@/messages/mk/claims.json';
import sqAgent from '@/messages/sq/agent-claims.json';
import sqClaims from '@/messages/sq/claims.json';
import srAgent from '@/messages/sr/agent-claims.json';
import srClaims from '@/messages/sr/claims.json';

import { ClaimActionPanelProvider } from './context';
import { RecoveryDecisionSection } from './recovery-decision-section';
import { getRecoveryDeclineReasonOptions } from './recovery-decision-helpers';

vi.unmock('next-intl');

const pendingDecision = {
  status: 'pending' as const,
  decidedAt: null,
  explanation: null,
  declineReasonCode: null,
  staffLabel: 'Pending staff decision',
  memberLabel: null,
  memberDescription: null,
};
const onDecline = vi.fn();

function TestSection() {
  const t = useTranslations('agent-claims.claims');
  const locale = useLocale();
  const [declineReasonCode, setDeclineReasonCode] = useState<RecoveryDeclineReasonCode | ''>('');
  const [decisionExplanation, setDecisionExplanation] = useState('');

  return (
    <ClaimActionPanelProvider
      value={{
        claimId: 'claim-1',
        isPending: false,
        startTransition: callback => callback(),
        t,
        tStatus: t,
      }}
    >
      <RecoveryDecisionSection
        declineReasonCode={declineReasonCode}
        decisionExplanation={decisionExplanation}
        locale={locale}
        recoveryDeclineReasonOptions={getRecoveryDeclineReasonOptions(t)}
        resolvedRecoveryDecision={pendingDecision}
        onAcceptRecoveryDecision={() => {}}
        onDeclineRecoveryDecision={onDecline}
        setDeclineReasonCode={setDeclineReasonCode}
        setDecisionExplanation={setDecisionExplanation}
      />
    </ClaimActionPanelProvider>
  );
}

function renderSection(locale: string, agent: typeof enAgent, member: typeof enClaims) {
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={{ 'agent-claims': agent['agent-claims'], claims: member.claims }}
    >
      <TestSection />
    </NextIntlClientProvider>
  );
}

it.each([
  { locale: 'en', agent: enAgent, member: enClaims },
  { locale: 'sq', agent: sqAgent, member: sqClaims },
  { locale: 'mk', agent: mkAgent, member: mkClaims },
  { locale: 'sr', agent: srAgent, member: srClaims },
])(
  'shows safe member wording while private reasoning stays separate in $locale',
  ({ locale, agent, member }) => {
    onDecline.mockClear();
    renderSection(locale, agent, member);

    const staffCopy = agent['agent-claims'].claims.staff_actions.recovery_decision;
    const memberCopy = member.claims.detail.recoveryDecision;
    const preview = screen.getByRole('region', { name: staffCopy.preview_title });
    expect(preview).toHaveTextContent(staffCopy.preview_select_category);
    expect(screen.getByTestId('staff-decline-recovery-decision-button')).toBeDisabled();

    const category = screen.getByRole('combobox', { name: staffCopy.decline_category_label });
    category.focus();
    fireEvent.change(category, { target: { value: 'conflict_or_integrity_concern' } });
    const explanation = screen.getByLabelText(staffCopy.explanation_label, { exact: false });
    fireEvent.change(explanation, { target: { value: 'Private allegation sentinel' } });

    expect(category).toHaveFocus();
    expect(explanation).toHaveAccessibleDescription(staffCopy.private_note);
    expect(within(preview).getByText(memberCopy.reasons.other.title)).toBeInTheDocument();
    expect(within(preview).getByText(memberCopy.reasons.other.description)).toBeInTheDocument();
    expect(within(preview).getByText(memberCopy.supportCta)).toBeInTheDocument();
    expect(preview).not.toHaveTextContent('Private allegation sentinel');
    expect(preview).not.toHaveTextContent(staffCopy.decline_reasons.conflict_or_integrity_concern);
    expect(screen.getByTestId('staff-decline-recovery-decision-button')).toBeEnabled();
    expect(onDecline).not.toHaveBeenCalled();
  }
);

it('updates the preview from the selected non-sensitive category', () => {
  renderSection('en', enAgent, enClaims);
  fireEvent.change(screen.getByRole('combobox', { name: 'Decline category' }), {
    target: { value: 'insufficient_evidence' },
  });

  const preview = screen.getByTestId('staff-member-decline-preview');
  expect(
    within(preview).getByText(
      enClaims.claims.detail.recoveryDecision.reasons.insufficient_evidence.title
    )
  ).toBeInTheDocument();
  expect(
    within(preview).getByText(
      enClaims.claims.detail.recoveryDecision.reasons.insufficient_evidence.description
    )
  ).toBeInTheDocument();
});
