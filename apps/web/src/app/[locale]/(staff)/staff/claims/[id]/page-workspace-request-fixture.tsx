import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import type { PublicInformationRequest } from '@interdomestik/domain-claims';

import enAgentClaims from '@/messages/en/agent-claims.json';
import enClaims from '@/messages/en/claims.json';
import enClaimsTracking from '@/messages/en/claims-tracking.json';
import mkAgentClaims from '@/messages/mk/agent-claims.json';
import mkClaims from '@/messages/mk/claims.json';
import mkClaimsTracking from '@/messages/mk/claims-tracking.json';
import sqAgentClaims from '@/messages/sq/agent-claims.json';
import sqClaims from '@/messages/sq/claims.json';
import sqClaimsTracking from '@/messages/sq/claims-tracking.json';
import srAgentClaims from '@/messages/sr/agent-claims.json';
import srClaims from '@/messages/sr/claims.json';
import srClaimsTracking from '@/messages/sr/claims-tracking.json';

/** Locales this route ships; request acceptance runs across all of them. */
export const LOCALES = ['en', 'sq', 'mk', 'sr'] as const;
export type WorkspaceLocale = (typeof LOCALES)[number];

/** Pinned so next-intl formatting is deterministic instead of machine dependent. */
export const TEST_TIME_ZONE = 'Europe/Belgrade';

// The real shipped catalogs back every label: route copy (agent-claims), request-card copy
// (claims) and status copy (claims-tracking). No translated mirror is authored here.
const CATALOGS: Record<WorkspaceLocale, Record<string, unknown>> = {
  en: { ...enAgentClaims, ...enClaims, ...enClaimsTracking },
  sq: { ...sqAgentClaims, ...sqClaims, ...sqClaimsTracking },
  mk: { ...mkAgentClaims, ...mkClaims, ...mkClaimsTracking },
  sr: { ...srAgentClaims, ...srClaims, ...srClaimsTracking },
};

/** Real message bundle for a locale; both the client provider and the server seam read it. */
export function messagesFor(locale: string): Record<string, unknown> {
  const catalog = CATALOGS[locale as WorkspaceLocale];
  if (!catalog) {
    throw new Error(`No shipped catalog bundle for locale ${locale}`);
  }
  return catalog;
}

export function readMessagePath(locale: string, path: readonly string[]): unknown {
  return path.reduce<unknown>(
    (value, segment) =>
      value && typeof value === 'object' ? (value as Record<string, unknown>)[segment] : undefined,
    messagesFor(locale)
  );
}

/** Exact shipped copy for a namespaced key; throws so assertions can never settle for a key. */
export function message(locale: string, path: string): string {
  const value = readMessagePath(locale, path.split('.'));
  if (typeof value !== 'string') {
    throw new TypeError(`Missing ${path} in the real ${locale} catalog`);
  }
  return value;
}

/** Mounts the route under the real client provider so client copy is translated, not echoed. */
export function IntlHarness({
  locale,
  children,
}: Readonly<{ locale: string; children: ReactNode }>) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messagesFor(locale)}
      timeZone={TEST_TIME_ZONE}
    >
      {children}
    </NextIntlClientProvider>
  );
}

export const openRequest: PublicInformationRequest = {
  requestId: '12345678-1234-4234-8234-123456789012',
  requestedInformation: 'Repair estimate',
  explanationForMember: 'Assessment detail',
  dueAt: '2026-10-20T10:00:00.000Z',
  status: 'open',
  fulfilledAt: null,
  fulfilledDocumentId: null,
  slaPosture: 'incomplete',
  createdAt: '2026-10-01T10:00:00.000Z',
  evidence: [],
  progress: 'awaiting_evidence',
};

export const submittedRequest: PublicInformationRequest = {
  ...openRequest,
  evidence: [
    {
      documentId: 'doc-1',
      documentName: 'estimate.pdf',
      submittedAt: '2026-10-02T10:00:00.000Z',
      acknowledgedAt: null,
    },
  ],
  progress: 'submitted',
};

export const fulfilledRequest: PublicInformationRequest = {
  ...openRequest,
  status: 'fulfilled',
  fulfilledAt: '2026-10-03T10:00:00.000Z',
  fulfilledDocumentId: 'doc-1',
  evidence: [
    {
      documentId: 'doc-1',
      documentName: 'estimate.pdf',
      submittedAt: '2026-10-02T10:00:00.000Z',
      acknowledgedAt: '2026-10-02T12:00:00.000Z',
    },
  ],
  progress: 'acknowledged',
};

export const REQUEST_FIXTURES = {
  open: openRequest,
  submitted: submittedRequest,
  fulfilled: fulfilledRequest,
} as const;
export type RequestFixtureName = keyof typeof REQUEST_FIXTURES;

/** Catalog paths the shipped card must render for each recorded request state. */
export const REQUEST_DUTY_COPY: Record<
  RequestFixtureName,
  { status: string; actor: string; action: string }
> = {
  open: {
    status: 'claims.informationRequests.status.open',
    actor: 'claims.informationRequests.nextActor.member',
    action: 'claims.informationRequests.nextAction.uploadEvidence',
  },
  submitted: {
    status: 'claims.informationRequests.status.open',
    actor: 'claims.informationRequests.nextActor.assignedStaff',
    action: 'claims.informationRequests.nextAction.reviewEvidence',
  },
  fulfilled: {
    status: 'claims.informationRequests.status.fulfilled',
    actor: 'claims.informationRequests.nextActor.none',
    action: 'claims.informationRequests.nextAction.none',
  },
};

// Duty copy that must never surface when no request asks the member for anything. The
// nextActor.member needle is deliberately excluded: its English copy ("Member") also appears as
// unrelated section wording, so an absent-request case is proven by the exact next-actor value
// instead of an unsound substring search.
export const MEMBER_DUTY_COPY = [
  'claims.informationRequests.nextAction.uploadEvidence',
  'claims.informationRequests.progress.awaiting_evidence',
] as const;

export const ACKNOWLEDGE_COPY = 'claims.informationRequests.acknowledge';
export const LOAD_ERROR_COPY = 'claims.informationRequests.loadError';
