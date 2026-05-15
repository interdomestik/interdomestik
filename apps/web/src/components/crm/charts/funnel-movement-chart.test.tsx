import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CRM_REPORTING_CHART_FUNNEL_MOVEMENT_MARKER } from './chart-contract';
import { FunnelMovementChart } from './funnel-movement-chart';

describe('FunnelMovementChart', () => {
  it('renders the stable marker, screen-reader summary, and non-animated count series', () => {
    render(
      <FunnelMovementChart
        description="Supplemental chart"
        locale="en"
        rows={[
          {
            enteredCount: 5,
            enteredFormatted: '5',
            exitedCount: 3,
            exitedFormatted: '3',
            id: 'pipeline-stage',
            label: 'Qualified / Sales',
            lostCount: 1,
            lostFormatted: '1',
            wonCount: 2,
            wonFormatted: '2',
          },
        ]}
        summary="Funnel summary. Qualified / Sales: Entered 5, Exited 3, Won 2, Lost 1"
        text={{ entered: 'Entered', exited: 'Exited', lost: 'Lost', won: 'Won' }}
        title="Funnel movement chart"
      />
    );

    expect(screen.getByTestId(CRM_REPORTING_CHART_FUNNEL_MOVEMENT_MARKER)).toHaveTextContent(
      'Funnel movement chart'
    );
    expect(screen.getByText(/Funnel summary/)).toHaveClass('sr-only');
    expect(screen.getByTestId('crm-chart-bar-enteredCount')).toHaveAttribute(
      'data-fill',
      'hsl(var(--primary))'
    );
    expect(screen.getByTestId('crm-chart-bar-lostCount')).toHaveAttribute(
      'data-animation',
      'false'
    );
  });
});
