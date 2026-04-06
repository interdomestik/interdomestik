import { beforeEach, describe, expect, it, vi } from 'vitest';

const initializePaddleMock = vi.fn();

vi.mock('@paddle/paddle-js', () => ({
  initializePaddle: initializePaddleMock,
}));

describe('getPaddleInstance', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('does not log Paddle events in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_PADDLE_CLIENT_TOKEN', 'test_token');

    initializePaddleMock.mockImplementation(async options => {
      options.eventCallback?.({ type: 'checkout.completed' });
      return { Checkout: { open: vi.fn() } };
    });

    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { getPaddleInstance } = await import('./paddle');

    await getPaddleInstance();

    expect(consoleLog).not.toHaveBeenCalled();
    consoleLog.mockRestore();
  });

  it('logs Paddle events in development for local debugging', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_PADDLE_CLIENT_TOKEN', 'test_token');

    initializePaddleMock.mockImplementation(async options => {
      options.eventCallback?.({ type: 'checkout.completed' });
      return { Checkout: { open: vi.fn() } };
    });

    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { getPaddleInstance } = await import('./paddle');

    await getPaddleInstance();

    expect(consoleLog).toHaveBeenCalledWith('Paddle Event:', { type: 'checkout.completed' });
    consoleLog.mockRestore();
  });
});
