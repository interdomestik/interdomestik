'use server';

import { DEFAULT_LOCALE, LOCALES, type AppLocale } from '@/i18n/locales';
import { redirect } from '@/i18n/routing';
import { getActionContext } from './context';
import { createMemberSupportHandoffCore } from './create.core';

function formDataToInput(formData: FormData) {
  const input: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    input[key] = typeof value === 'string' ? value : '';
  }
  return input;
}

function getSupportedLocale(value: unknown): AppLocale {
  return typeof value === 'string' && LOCALES.includes(value as AppLocale)
    ? (value as AppLocale)
    : DEFAULT_LOCALE;
}

async function executeCreateMemberSupportHandoff(formData: FormData) {
  const { session, requestHeaders } = await getActionContext();
  const input = formDataToInput(formData);
  const locale = getSupportedLocale(input.locale);
  delete input.locale;

  const result = await createMemberSupportHandoffCore({
    input,
    requestHeaders,
    session,
  });

  return { locale, result };
}

export async function createMemberSupportHandoff(formData: FormData) {
  const { locale, result } = await executeCreateMemberSupportHandoff(formData);

  if (!result.success) {
    redirect({
      href: `/member/help?support=error&code=${encodeURIComponent(result.error)}`,
      locale,
    });
  }

  redirect({ href: '/member/help?support=created', locale });
}
