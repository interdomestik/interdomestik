import catalog from '@/messages/en/staff-correspondence.json';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, vi } from 'vitest';
const action = vi.hoisted(() => ({
  refresh: vi.fn(),
  fields: vi.fn(),
  record: vi.fn(),
  revoke: vi.fn(),
  inbound: vi.fn(),
  outbound: vi.fn(),
  followUp: vi.fn(),
}));

vi.unmock('next-intl');
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: action.refresh }) }));
vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    className,
  }: {
    children: ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
vi.mock('@/actions/staff-claims/case-authorities', () => ({
  recordCaseAuthority: action.record,
  revokeCaseAuthority: action.revoke,
  updateGreenCardCaseFields: action.fields,
}));
vi.mock('@/actions/staff-claims/correspondence', () => ({
  recordInboundCorrespondence: action.inbound,
  recordOutboundCorrespondence: action.outbound,
  setCorrespondenceFollowUp: action.followUp,
}));

export const copy = catalog['staff-correspondence'];
export function show(view: ReactNode) {
  const wrap = (child: ReactNode) => (
    <NextIntlClientProvider locale="en" messages={catalog}>
      {child}
    </NextIntlClientProvider>
  );
  const result = render(wrap(view));
  return { ...result, rerender: (child: ReactNode) => result.rerender(wrap(child)) };
}

export function set(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
}

export function submit(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

export function enterContact() {
  set(copy.entry.occurredUtc, '2026-01-02T12:30');
  set(copy.entry.organisation, 'Synthetic insurer');
  set(copy.entry.body, 'Synthetic reply');
}

beforeEach(() => {
  vi.resetAllMocks();
  for (const mock of [
    action.fields,
    action.record,
    action.revoke,
    action.inbound,
    action.outbound,
    action.followUp,
  ]) {
    mock.mockResolvedValue({ success: true });
  }
});

export { action };
