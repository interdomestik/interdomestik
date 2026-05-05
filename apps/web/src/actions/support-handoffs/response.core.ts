import { updateSupportHandoffPublicResponseCore as updateDomainPublicResponse } from '@interdomestik/domain-claims/support-handoffs/response';

import { logAuditEvent } from '@/lib/audit';
import { notifySupportHandoffPublicResponse } from '@/lib/notifications';
import { revalidatePath } from 'next/cache';

import type { Session } from './context';

const LOCALES = ['sq', 'en', 'sr', 'mk'] as const;
type Locale = (typeof LOCALES)[number];

const SUPPORT_HANDOFF_PUBLIC_RESPONSE_NOTIFICATION_COPY: Record<
  Locale,
  { content: string; title: string }
> = {
  en: {
    content: 'A staff update is available on your support request.',
    title: 'Staff update available',
  },
  mk: {
    content: 'Достапно е ажурирање од персоналот за вашето барање за поддршка.',
    title: 'Достапно е ажурирање од персоналот',
  },
  sq: {
    content: 'Një përditësim nga stafi është i disponueshëm për kërkesën tuaj të mbështetjes.',
    title: 'Përditësim nga stafi',
  },
  sr: {
    content: 'Dostupno je ažuriranje osoblja za vaš zahtev za podršku.',
    title: 'Dostupno je ažuriranje osoblja',
  },
};

function isLocale(value: string | undefined): value is Locale {
  return LOCALES.includes(value as Locale);
}

function resolveRequestLocale(requestHeaders?: Headers): Locale {
  const referer = requestHeaders?.get('referer');
  if (referer) {
    try {
      const [, locale] = new URL(referer).pathname.split('/');
      if (isLocale(locale)) {
        return locale;
      }
    } catch {
      // Fall through to Accept-Language.
    }
  }

  const acceptLanguage = requestHeaders?.get('accept-language') ?? '';
  const requestedLocale = acceptLanguage
    .split(',')
    .map(value => value.trim().split(';')[0]?.split('-')[0])
    .find(isLocale);

  return requestedLocale ?? 'sq';
}

function revalidatePathForAllLocales(path: string) {
  for (const locale of LOCALES) {
    revalidatePath(`/${locale}${path}`);
  }
}

function revalidateSupportHandoffPaths() {
  revalidatePathForAllLocales('/staff/support-handoffs');
}

function revalidateMemberHelpPaths() {
  revalidatePathForAllLocales('/member/help');
}

export async function updateSupportHandoffPublicResponseCore(params: {
  expectedVersion?: number;
  handoffId: string;
  requestHeaders?: Headers;
  response: string;
  session: NonNullable<Session> | null;
}) {
  const result = await updateDomainPublicResponse(params, { logAuditEvent });

  if (result.success) {
    try {
      const locale = resolveRequestLocale(params.requestHeaders);
      const notificationCopy = SUPPORT_HANDOFF_PUBLIC_RESPONSE_NOTIFICATION_COPY[locale];
      const notificationResult = await notifySupportHandoffPublicResponse(
        result.data.memberId,
        {
          id: result.data.handoffId,
          publicResponseVersion: result.data.publicResponseVersion,
        },
        {
          actionUrl: `/${locale}/member/help?handoffId=${encodeURIComponent(result.data.handoffId)}`,
          content: notificationCopy.content,
          tenantId: result.data.tenantId,
          title: notificationCopy.title,
        }
      );

      if (!notificationResult.success) {
        console.error('Failed to create support handoff public response notification:', {
          error: notificationResult.error,
          handoffId: result.data.handoffId,
        });
      }
    } catch (error) {
      console.error('Failed to create support handoff public response notification:', {
        error,
        handoffId: result.data.handoffId,
      });
    }

    revalidateSupportHandoffPaths();
    revalidateMemberHelpPaths();
  }

  return result;
}
