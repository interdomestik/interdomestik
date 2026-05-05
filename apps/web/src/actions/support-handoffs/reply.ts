'use server';

import { MAX_MEMBER_REPLY_LENGTH } from '@interdomestik/domain-claims/support-handoffs/types';
import { z } from 'zod';

import { getActionContext } from './context';
import { submitSupportHandoffMemberReplyCore } from './reply.core';

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
  replyText: z.string().trim().min(1).max(MAX_MEMBER_REPLY_LENGTH),
});

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
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
      error: 'Member reply is required and must be 1,000 characters or fewer.',
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
