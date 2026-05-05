'use server';

import { MAX_MEMBER_REPLY_LENGTH } from '@interdomestik/domain-claims/support-handoffs/types';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { getActionContext } from './context';
import { submitSupportHandoffMemberReplyCore } from './reply.core';
import { type SupportHandoffActionLocale } from './request-locale';

export type MemberReplyActionState = {
  code?: string;
  error?: string;
  memberReplyAt?: string;
  memberReplyResponseVersion?: number;
  success: boolean;
};

const memberReplySchema = z.object({
  expectedPublicResponseVersion: z.coerce.number().int().positive(),
  handoffId: z.string().min(1),
  replyText: z.string().trim(),
});

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function getMemberReplyLocale(formData: FormData): SupportHandoffActionLocale {
  const locale = getString(formData, 'locale');
  return locale === 'en' || locale === 'sr' || locale === 'mk' ? locale : 'sq';
}

function getSafeReturnTo(formData: FormData) {
  const returnTo = getString(formData, 'returnTo');
  return returnTo.startsWith('/') && !returnTo.startsWith('//')
    ? returnTo
    : `/${getMemberReplyLocale(formData)}/member/help`;
}

export async function submitSupportHandoffMemberReply(
  _previousState: MemberReplyActionState,
  formData: FormData
): Promise<MemberReplyActionState> {
  const parsed = memberReplySchema.safeParse({
    expectedPublicResponseVersion: getString(formData, 'expectedPublicResponseVersion'),
    handoffId: getString(formData, 'handoffId'),
    replyText: getString(formData, 'memberReply'),
  });

  if (!parsed.success) {
    return {
      code: 'VALIDATION',
      error: 'Member reply is invalid.',
      success: false,
    };
  }

  if (!parsed.data.replyText) {
    return {
      code: 'VALIDATION_REQUIRED',
      error: 'Member reply is required.',
      success: false,
    };
  }

  if (parsed.data.replyText.length > MAX_MEMBER_REPLY_LENGTH) {
    return {
      code: 'VALIDATION_TOO_LONG',
      error: 'Member reply must be 1,000 characters or fewer.',
      success: false,
    };
  }

  const { session, requestHeaders } = await getActionContext();
  const result = await submitSupportHandoffMemberReplyCore({
    expectedPublicResponseVersion: parsed.data.expectedPublicResponseVersion,
    handoffId: parsed.data.handoffId,
    replyText: parsed.data.replyText,
    requestHeaders,
    session,
  });

  if (!result.success) {
    return {
      code: result.code,
      error: result.error,
      success: false,
    };
  }

  return {
    memberReplyAt: result.data.memberReplyAt,
    memberReplyResponseVersion: result.data.memberReplyResponseVersion,
    success: true,
  };
}

export async function submitSupportHandoffMemberReplyAndRedirect(
  formData: FormData
): Promise<never> {
  await submitSupportHandoffMemberReply({ success: false }, formData);
  redirect(getSafeReturnTo(formData));
}
