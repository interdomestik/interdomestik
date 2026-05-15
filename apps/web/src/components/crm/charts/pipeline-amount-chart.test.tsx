import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CRM_REPORTING_CHART_PIPELINE_AMOUNT_MARKER } from './chart-contract';
import { PipelineAmountChart } from './pipeline-amount-chart';

describe('PipelineAmountChart', () => {
  it('renders the stable marker, screen-reader summary, and non-animated token-colored bars', () => {
    render(
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
      'Pipeline amount chart'
    );
    expect(screen.getByText(/Pipeline summary/)).toHaveClass('sr-only');
    expect(screen.getByTestId('crm-chart-bar-totalAmount')).toHaveAttribute(
      'data-fill',
      'hsl(var(--secondary))'
    );
    expect(screen.getByTestId('crm-chart-bar-weightedAmount')).toHaveAttribute(
      'data-animation',
      'false'
    );
  });

  it('omits the chart when there are no rows', () => {
    render(
      <PipelineAmountChart
        description="Supplemental chart"
        locale="en"
        rows={[]}
        summary=""
        text={{ total: 'Total', weighted: 'Weighted' }}
        title="Pipeline amount chart"
      />
    );

    expect(
      screen.queryByTestId(CRM_REPORTING_CHART_PIPELINE_AMOUNT_MARKER)
    ).not.toBeInTheDocument();
  });
});
