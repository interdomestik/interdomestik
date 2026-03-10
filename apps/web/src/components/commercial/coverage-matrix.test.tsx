import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CoverageMatrix } from './coverage-matrix';

describe('CoverageMatrix', () => {
  it('does not emit duplicate-key warnings when a row reuses the same label', () => {
    const consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <CoverageMatrix
        columns={['Included', 'Escalation', 'Referral']}
        footerBody="Boundary body"
        footerTitle="Boundary title"
        rowHeaderTitle="Claim type"
        rows={[
          {
            title: 'Flight delay compensation',
            description: 'Later-phase launch scope row.',
            cells: [
              { label: 'Later phase', tone: 'laterPhase' },
              { label: 'Later phase', tone: 'laterPhase' },
              { label: 'Later phase', tone: 'laterPhase' },
            ],
          },
        ]}
        subtitle="Subtitle"
        title="Title"
      />
    );

    expect(
      consoleErrorMock.mock.calls.some(([message]) =>
        String(message).includes('Encountered two children with the same key')
      )
    ).toBe(false);

    consoleErrorMock.mockRestore();
  });
});
