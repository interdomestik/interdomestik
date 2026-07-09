import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CaseCompanionNextStepCard } from './CaseCompanionNextStepCard';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace?: string) => (key: string) => {
    const messages: Record<string, string> = {
      'claims-tracking.case_companion.title': 'Case Companion',
      'claims-tracking.case_companion.ownerLabel': 'Owner',
      'claims-tracking.case_companion.statusLabel': 'Status',
      'claims-tracking.case_companion.expectationLabel': 'Expected timing',
      'claims-tracking.case_companion.dateUnavailableLabel': 'Date unavailable.',
      'claims-tracking.case_companion.owner.interdomestik': 'Interdomestik case team',
      'claims-tracking.case_companion.status_sentence.evaluation':
        'The case team is reviewing the safe case details.',
      'claims-tracking.case_companion.status_sentence.resolved':
        'The final outcome has been recorded.',
      'claims-tracking.case_companion.status_sentence.redacted':
        'This case is available in a protected limited view.',
      'claims-tracking.case_companion.action.no_action': 'No action is needed from you right now.',
      'claims-tracking.case_companion.awaiting_date.case_team_review':
        'Date awaiting case-team review.',
      'claims-tracking.case_companion.awaiting_date.outcome_recorded':
        'Final outcome recorded; no next-step date is needed.',
      'claims-tracking.case_companion.awaiting_date.erased_subject':
        'Date hidden because the subject data is erased.',
    };
    const fullKey = namespace ? `${namespace}.${key}` : key;
    return messages[fullKey] ?? fullKey;
  },
}));

describe('CaseCompanionNextStepCard', () => {
  it('renders one read-only next step with case-team language', () => {
    render(
      <CaseCompanionNextStepCard
        nextStep={{
          owner: 'interdomestik',
          statusSentenceKey: 'claims-tracking.case_companion.status_sentence.evaluation',
          actionKind: 'no_action',
          actionKey: 'claims-tracking.case_companion.action.no_action',
          nextStepDate: null,
          awaitingDateReason: 'case_team_review',
          renderMode: 'standard',
        }}
      />
    );

    expect(screen.getAllByTestId('member-claim-case-companion-next-step')).toHaveLength(1);
    expect(screen.getByTestId('member-claim-next-step-owner')).toHaveTextContent(
      'Interdomestik case team'
    );
    expect(screen.getByTestId('member-claim-next-step-status')).toHaveTextContent(
      'The case team is reviewing the safe case details.'
    );
    expect(screen.getByTestId('member-claim-next-step-expectation')).toHaveTextContent(
      'Date awaiting case-team review.'
    );
    expect(screen.getByTestId('member-claim-next-step-action')).toHaveTextContent(
      'No action is needed from you right now.'
    );
    expect(screen.queryByText(/case manager|handler|assigned to/i)).not.toBeInTheDocument();
  });

  it('renders a serialized outcome date without exposing the raw ISO value', () => {
    render(
      <CaseCompanionNextStepCard
        nextStep={{
          owner: 'interdomestik',
          statusSentenceKey: 'claims-tracking.case_companion.status_sentence.resolved',
          actionKind: 'no_action',
          actionKey: 'claims-tracking.case_companion.action.no_action',
          nextStepDate: '2026-07-09T08:00:00.000Z',
          awaitingDateReason: null,
          renderMode: 'standard',
        }}
      />
    );

    expect(screen.getByTestId('member-claim-next-step-expectation')).not.toHaveTextContent(
      '2026-07-09T08:00:00.000Z'
    );
    expect(screen.getByTestId('member-claim-next-step-expectation')).toHaveTextContent('2026');
  });

  it('uses a neutral fallback when a serialized outcome date is invalid', () => {
    render(
      <CaseCompanionNextStepCard
        nextStep={{
          owner: 'interdomestik',
          statusSentenceKey: 'claims-tracking.case_companion.status_sentence.resolved',
          actionKind: 'no_action',
          actionKey: 'claims-tracking.case_companion.action.no_action',
          nextStepDate: 'not-a-date',
          awaitingDateReason: null,
          renderMode: 'standard',
        }}
      />
    );

    expect(screen.getByTestId('member-claim-next-step-expectation')).toHaveTextContent(
      'Date unavailable.'
    );
    expect(screen.getByTestId('member-claim-next-step-expectation')).not.toHaveTextContent(
      'Final outcome recorded'
    );
  });

  it('renders erased state without subject detail', () => {
    render(
      <CaseCompanionNextStepCard
        nextStep={{
          owner: 'interdomestik',
          statusSentenceKey: 'claims-tracking.case_companion.status_sentence.redacted',
          actionKind: 'no_action',
          actionKey: 'claims-tracking.case_companion.action.no_action',
          nextStepDate: null,
          awaitingDateReason: 'erased_subject',
          renderMode: 'erased',
        }}
      />
    );

    expect(screen.getByTestId('member-claim-next-step-status')).toHaveTextContent(
      'This case is available in a protected limited view.'
    );
    expect(screen.getByTestId('member-claim-next-step-expectation')).toHaveTextContent(
      'Date hidden because the subject data is erased.'
    );
    expect(screen.queryByText(/handler|case manager|assigned to/i)).not.toBeInTheDocument();
  });
});
