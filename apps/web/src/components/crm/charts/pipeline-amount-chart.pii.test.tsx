import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CRM_REPORTING_CHART_PIPELINE_AMOUNT_MARKER } from './chart-contract';
import { PipelineAmountChart } from './pipeline-amount-chart';

describe('PipelineAmountChart PII regression', () => {
  it('renders only aggregate-safe labels and data keys', () => {
    const { container } = render(
      <PipelineAmountChart
        description="Supplemental chart"
        locale="en"
        rows={[
          {
            currencyCode: 'EUR',
            id: 'branch-pipeline-eur',
            label: 'Branch A / Pipeline A',
            totalAmountMinor: 10000,
            totalFormatted: '100.00 EUR',
            weightedAmountMinor: 7000,
            weightedFormatted: '70.00 EUR',
          },
        ]}
        summary="Pipeline summary. Branch A / Pipeline A: Weighted 70.00 EUR, Total 100.00 EUR"
        text={{ total: 'Total', weighted: 'Weighted' }}
        title="Pipeline amount chart"
      />
    );

    expect(screen.getByTestId(CRM_REPORTING_CHART_PIPELINE_AMOUNT_MARKER)).toHaveTextContent(
      'Branch A / Pipeline A'
    );
    expect(container).not.toHaveTextContent('member@example.com');
    expect(container).not.toHaveTextContent('+38344111222');
    expect(container.innerHTML).not.toContain('fullName');
    expect(container.innerHTML).not.toContain('notes');
  });
});
