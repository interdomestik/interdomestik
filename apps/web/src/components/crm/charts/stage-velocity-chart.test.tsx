import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CRM_REPORTING_CHART_STAGE_VELOCITY_MARKER } from './chart-contract';
import { StageVelocityChart } from './stage-velocity-chart';

describe('StageVelocityChart', () => {
  it('renders the stable marker, screen-reader summary, and non-animated duration series', () => {
    render(
      <StageVelocityChart
        description="Supplemental chart"
        locale="en"
        rows={[
          {
            averageDays: 4,
            averageFormatted: '4 days',
            id: 'pipeline-stage',
            label: 'Qualified / Sales',
            medianDays: 5,
            medianFormatted: '5 days',
          },
        ]}
        summary="Velocity summary. Qualified / Sales: Median 5 days, Average 4 days"
        text={{ average: 'Average', median: 'Median' }}
        title="Stage velocity chart"
      />
    );

    expect(screen.getByTestId(CRM_REPORTING_CHART_STAGE_VELOCITY_MARKER)).toHaveTextContent(
      'Stage velocity chart'
    );
    expect(screen.getByText(/Velocity summary/)).toHaveClass('sr-only');
    expect(screen.getByTestId('crm-chart-bar-medianDays')).toHaveAttribute(
      'data-fill',
      'hsl(var(--primary))'
    );
    expect(screen.getByTestId('crm-chart-bar-averageDays')).toHaveAttribute(
      'data-animation',
      'false'
    );
  });
});
