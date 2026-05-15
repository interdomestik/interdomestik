import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FunnelMovementChart } from './funnel-movement-chart';

describe('FunnelMovementChart PII regression', () => {
  it('renders only aggregate-safe labels and data keys', () => {
    const { container } = render(
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

    expect(container).toHaveTextContent('Qualified / Sales');
    expect(container).not.toHaveTextContent('member@example.com');
    expect(container).not.toHaveTextContent('+38344111222');
    expect(container.innerHTML).not.toContain('fullName');
    expect(container.innerHTML).not.toContain('notes');
  });
});
