'use server';
import { getMessagesForClaim, markMessagesAsRead, sendMessage } from './messages.core';

export type { MessageWithSender } from './messages.core';
export { getMessagesForClaim, markMessagesAsRead, sendMessage };
