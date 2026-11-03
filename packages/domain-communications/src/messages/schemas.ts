import { z } from 'zod';

/** A per-draft retry key: a client UUID or any other short URL-safe token. */
export const CLIENT_MESSAGE_ID_PATTERN = /^[\w-]{8,64}$/;

export const sendMessageSchema = z.object({
  claimId: z.string().min(1, { message: 'Invalid claim ID' }),
  content: z
    .string()
    .trim()
    .min(1, { message: 'Message cannot be empty' })
    .max(2000, { message: 'Message cannot exceed 2000 characters' }),
  isInternal: z.boolean().optional(),
  clientMessageId: z
    .string()
    .regex(CLIENT_MESSAGE_ID_PATTERN, { message: 'Invalid message key' })
    .optional(),
});

export const getMessagesSchema = z.object({
  claimId: z.string().min(1, { message: 'Invalid claim ID' }),
});

export const markMessagesReadSchema = z.object({
  messageIds: z.array(z.string().min(1)),
});
