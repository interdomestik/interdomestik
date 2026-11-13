import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  formatDateTime,
  PublicResponseAcknowledgementStatus,
} from './support-handoff-detail-parts';
import type { DetailLabels } from './support-handoff-detail-labels';

const CREATED = '2026-11-12T10:02:00.000Z';

describe('support hand-off detail dates (qa3 #55)', () => {
  it.each([
    ['sq', '12.11.2026 11:02'],
    ['sr', '12.11.2026 11:02'],
    ['mk', '12.11.2026 11:02'],
    ['de', '12.11.2026 11:02'],
    ['en', '11/12/2026 11:02'],
  ])('uses the pilot-zone 24-hour format in %s', (locale, expected) => {
    expect(formatDateTime(CREATED, locale, 'Pending')).toBe(expected);
  });

  it('keeps the pending label for missing or invalid timestamps', () => {
    expect(formatDateTime(null, 'sq', 'Në pritje')).toBe('Në pritje');
    expect(formatDateTime('not-a-date', 'sq', 'Në pritje')).toBe('Në pritje');
  });

  it('never shows the native "M11"/AM-PM cycle in the acknowledgement line', () => {
    render(
      <PublicResponseAcknowledgementStatus
        locale="sq"
        labels={
          {
            publicResponseAcknowledgedAt: 'Konfirmuar më {date}',
            lifecyclePending: 'Në pritje',
          } as DetailLabels
        }
        publicResponse={
          {
            publicResponse: 'Përgjigje',
            publicResponseAcknowledged: true,
            publicResponseAcknowledgedAt: CREATED,
          } as Parameters<typeof PublicResponseAcknowledgementStatus>[0]['publicResponse']
        }
      />
    );
    const status = screen.getByTestId('staff-support-handoff-public-response-acknowledged');
    expect(status).toHaveTextContent('Konfirmuar më 12.11.2026 11:02');
    expect(status.textContent).not.toMatch(/M11|AM|PM/);
  });
});
