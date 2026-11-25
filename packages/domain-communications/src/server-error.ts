import { describePublicReplyFailure } from './messages/send-error';

export function reportServerError(message: string, error: unknown) {
  // Database and provider errors can contain parameters, recipient addresses and message bodies.
  console.error(message, new Error(message, { cause: describePublicReplyFailure(error) }));
}
