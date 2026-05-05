'use server';

import { redirect } from 'next/navigation';
import { getFormatter } from 'next-intl/server';

import { getActionContext } from './context';
import { acknowledgeSupportHandoffPublicResponseCore } from './acknowledgement.core';
import { type SupportHandoffActionLocale } from './request-locale';

export type PublicResponseAcknowledgementActionState = {
  acknowledgedAt?: string;
  acknowledgedAtLabel?: string;
  code?: string;
  error?: string;
  success: boolean;
};

const INITIAL_FAILURE: PublicResponseAcknowledgementActionState = {
  error: 'Unable to acknowledge this support update.',
  success: false,
};

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function getExpectedPublicResponseVersion(formData: FormData) {
  const parsed = Number(getString(formData, 'expectedPublicResponseVersion'));
  return Number.isFinite(parsed) ? parsed : -1;
}

function getSafeReturnTo(formData: FormData) {
  const returnTo = getString(formData, 'returnTo');
  return returnTo.startsWith('/') && !returnTo.startsWith('//')
    ? returnTo
    : `/${getAcknowledgementLocale(formData)}/member/help`;
}

function getAcknowledgementLocale(formData: FormData): SupportHandoffActionLocale {
  const locale = getString(formData, 'locale');
  return locale === 'en' || locale === 'sr' || locale === 'mk' ? locale : 'sq';
}

async function formatAcknowledgedAt(value: string, locale: SupportHandoffActionLocale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const format = await getFormatter({ locale });
  return format.dateTime(date, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

async function formatAcknowledgedAtLabel(formData: FormData, acknowledgedAt: string) {
  const template = getString(formData, 'acknowledgedAtLabelTemplate');
  if (!template) {
    return undefined;
  }

  return template.replace(
    '{date}',
    await formatAcknowledgedAt(acknowledgedAt, getAcknowledgementLocale(formData))
  );
}

export async function acknowledgeSupportHandoffPublicResponse(
  _previousState: PublicResponseAcknowledgementActionState,
  formData: FormData
): Promise<PublicResponseAcknowledgementActionState> {
  const { session, requestHeaders } = await getActionContext();
  const result = await acknowledgeSupportHandoffPublicResponseCore({
    expectedPublicResponseVersion: getExpectedPublicResponseVersion(formData),
    handoffId: getString(formData, 'handoffId'),
    requestHeaders,
    session,
  });

  if (!result.success) {
    return {
      code: result.code,
      error: result.error || INITIAL_FAILURE.error,
      success: false,
    };
  }

  return {
    acknowledgedAt: result.data.acknowledgedAt,
    acknowledgedAtLabel: await formatAcknowledgedAtLabel(formData, result.data.acknowledgedAt),
    success: true,
  };
}

export async function acknowledgeSupportHandoffPublicResponseAndRedirect(
  formData: FormData
): Promise<never> {
  await acknowledgeSupportHandoffPublicResponse({ success: false }, formData);
  redirect(getSafeReturnTo(formData));
}
