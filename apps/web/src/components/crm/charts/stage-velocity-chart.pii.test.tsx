import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StageVelocityChart } from './stage-velocity-chart';

describe('StageVelocityChart PII regression', () => {
  it('renders only aggregate-safe labels and data keys', () => {
    const { container } = render(
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

    expect(container).toHaveTextContent('Qualified / Sales');
    expect(container).not.toHaveTextContent('member@example.com');
    expect(container).not.toHaveTextContent('+38344111222');
    expect(container.innerHTML).not.toContain('fullName');
    expect(container.innerHTML).not.toContain('notes');
  });
});
