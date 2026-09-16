import { render, screen, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
vi.unmock('next-intl');
import en from '@/messages/en/claims.json';
import sq from '@/messages/sq/claims.json';
import mk from '@/messages/mk/claims.json';
import sr from '@/messages/sr/claims.json';
import { ClaimInformationRequests } from './ClaimInformationRequests';
afterEach(cleanup);
const request = {
  requestId: '12345678-1234-4234-8234-123456789012',
  requestedInformation: '<script>estimate</script>',
  explanationForMember: 'Assessment detail',
  dueAt: '2000-01-01T00:00:00.000Z',
  slaPosture: 'incomplete' as const,
  createdAt: '2026-09-16T10:00:00.000Z',
};
it.each([
  { locale: 'en', messages: en },
  { locale: 'sq', messages: sq },
  { locale: 'mk', messages: mk },
  { locale: 'sr', messages: sr },
])('renders safe identifiable cards in $locale', ({ locale, messages }) => {
  const { container } = render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <ClaimInformationRequests requests={[request]} />
    </NextIntlClientProvider>
  );
  expect(
    screen.getByRole('region', { name: messages.claims.informationRequests.title })
  ).toBeInTheDocument();
  expect(screen.getByText(request.requestId)).toBeInTheDocument();
  expect(screen.getByText(request.requestedInformation)).toBeInTheDocument();
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('time')).toHaveAttribute('datetime', request.dueAt);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
it('does not invent a request in the empty state', () => {
  const { container } = render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ClaimInformationRequests requests={[]} />
    </NextIntlClientProvider>
  );
  expect(container).toBeEmptyDOMElement();
});
