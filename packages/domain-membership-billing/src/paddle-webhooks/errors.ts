export class RetryablePaddleWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryablePaddleWebhookError';
  }
}

export function isRetryablePaddleWebhookError(
  error: unknown
): error is RetryablePaddleWebhookError {
  return error instanceof RetryablePaddleWebhookError;
}
