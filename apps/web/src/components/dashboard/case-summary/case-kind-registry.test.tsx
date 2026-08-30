import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CaseSummaryCard } from './accident-case-summary';
import { caseKindRegistry } from './case-kind-registry';
import { GenericCaseSummary } from './generic-case-summary';

const summary = {
  caseKind: 'accident' as const,
  id: 'claim-1',
  reference: null,
  status: 'submitted' as const,
  documentCount: 0,
  nextStep: 'team_review' as const,
  occurredAt: null,
};
const labels = {
  reference: 'Case reference',
  referenceFallback: 'Reference unavailable',
  status: 'Status',
  statusValue: 'Submitted',
  documentCount: 'Documents',
  nextStep: 'Next step',
  nextStepValue: 'Our team reviews your case',
};

describe('caseKindRegistry', () => {
  it('registers the accident renderer exhaustively', () => {
    expect(caseKindRegistry.accident.component).toBe(CaseSummaryCard);
    expect(caseKindRegistry.generic.component).toBe(GenericCaseSummary);
  });

  it('renders semantic facts in source order with explicit zero and localized labels', () => {
    render(<CaseSummaryCard summary={summary} labels={labels} />);
    const article = screen.getByRole('article', { name: 'Reference unavailable' });
    expect(article.querySelectorAll('dt')).toHaveLength(3);
    expect([...article.querySelectorAll('dt')].map(node => node.textContent)).toEqual([
      'Status',
      'Documents',
      'Next step',
    ]);
    const values = article.querySelectorAll('dd');
    expect(values[0]).toHaveTextContent('Submitted');
    expect(values[1]?.textContent).toBe('0');
    expect(article).not.toHaveTextContent('team_review');
    expect(article).not.toHaveTextContent('claim-1');
  });

  it('keeps the unmounted leaf server-safe and boundary-clean', () => {
    const source = [
      'accident-case-summary.tsx',
      'case-kind-registry.ts',
      'generic-case-summary.tsx',
    ]
      .map(file => readFileSync(new URL(file, import.meta.url), 'utf8'))
      .join('\n');
    expect(source).not.toMatch(
      /['"]use client['"]|useState|useEffect|fetch\(|onClick|<button|backdrop|filter|glass|motion|w-\[|next-intl|@interdomestik\/(?:database|shared-auth|domain-(?!member))|next\//u
    );
    expect(source).toMatch(/import type .*@interdomestik\/domain-member/u);
  });
});
