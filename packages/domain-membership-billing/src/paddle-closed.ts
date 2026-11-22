export const PADDLE_CLOSED = true;

export class PaddleClosedError extends Error {
  readonly code = 'PADDLE_CLOSED';

  constructor() {
    super('Paddle is closed');
    this.name = 'PaddleClosedError';
  }
}

export function assertPaddleOpen(): void {
  if (PADDLE_CLOSED) throw new PaddleClosedError();
}
