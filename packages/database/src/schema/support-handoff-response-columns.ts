import { integer, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth';

export function supportHandoffResponseColumns() {
  return {
    publicResponseAcknowledgedAt: timestamp('public_response_acknowledged_at'),
    publicResponseAcknowledgedById: text('public_response_acknowledged_by_id').references(
      () => user.id
    ),
    publicResponseAcknowledgedVersion: integer('public_response_acknowledged_version'),
    memberReply: text('member_reply'),
    memberReplyAt: timestamp('member_reply_at'),
    memberReplyResponseVersion: integer('member_reply_response_version'),
  };
}
