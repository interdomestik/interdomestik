import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  SUPPORT_HANDOFF_QUEUE_GRID,
  SupportHandoffQueueHeader,
} from './support-handoff-queue-grid';

describe('support hand-off queue grid (qa3 #61)', () => {
  it('reflows to three columns below xl and gives the member column a minimum width at xl', () => {
    expect(SUPPORT_HANDOFF_QUEUE_GRID).toContain('md:grid-cols-3');
    expect(SUPPORT_HANDOFF_QUEUE_GRID).toMatch(
      /xl:grid-cols-\[minmax\(0,[\d.]+fr\)_minmax\(11rem,/
    );
    expect(SUPPORT_HANDOFF_QUEUE_GRID).not.toContain('md:grid-cols-6');
  });

  it('renders the six column headings in row order on the shared grid', () => {
    const { container } = render(<SupportHandoffQueueHeader t={key => `[${key}]`} />);
    const header = container.firstElementChild;
    expect(header).toHaveClass('md:grid-cols-3', 'border-b');
    expect(Array.from(header?.children ?? [], child => child.textContent)).toEqual([
      '[table.request]',
      '[table.member]',
      '[table.relationship]',
      '[table.risk]',
      '[table.owner]',
      '[table.actions]',
    ]);
    expect(screen.getByText('[table.actions]')).toHaveClass('text-right');
  });
});
