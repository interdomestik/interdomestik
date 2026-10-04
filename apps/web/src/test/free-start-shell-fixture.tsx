import { render } from '@testing-library/react';
import { vi } from 'vitest';
import {
  createFreeStartAnalyticsMock,
  createFreeStartTranslationsMock,
  createRoutingLinkMock,
  createSupportContactsMock,
  type LocaleId,
} from './free-start-organizer-harness';

const boundary = vi.hoisted(() => ({
  freeStartCompleted: vi.fn(),
  generatePack: vi.fn(),
  submitIntake: vi.fn(),
  locale: 'en' as 'en' | 'sq',
}));

vi.mock('next-intl', () => createFreeStartTranslationsMock(() => boundary.locale));
vi.mock('@/i18n/routing', () => createRoutingLinkMock());
vi.mock('@/lib/support-contacts', () => createSupportContactsMock());
vi.mock('@/lib/analytics', () => createFreeStartAnalyticsMock(boundary.freeStartCompleted));
vi.mock('@/actions/free-start.core', () => ({ submitFreeStartIntake: boundary.submitIntake }));
vi.mock('@/actions/claim-pack.core', () => ({ generateClaimPackAction: boundary.generatePack }));

import { FreeStartIntakeShell } from '@/app/[locale]/components/home/free-start-intake-shell';

/** Each isolated suite keeps its own defaults and controls the actual async action answers. */
export function getFreeStartShellBoundary() {
  return boundary;
}

export function renderFreeStart(locale: LocaleId, continueHref = '/pricing') {
  boundary.locale = locale;
  return render(
    <FreeStartIntakeShell continueHref={continueHref} locale={locale} tenantId="tenant_public" />
  );
}
