import { beforeEach, describe, expect, it, vi } from 'vitest';

const initializePaddleMock = vi.fn();
const checkoutCompletedEvent = { type: 'checkout.completed' };

vi.mock('@paddle/paddle-js', () => ({
  initializePaddle: initializePaddleMock,
}));

async function loadPaddleInstance(nodeEnv: 'development' | 'production') {
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.stubEnv('NEXT_PUBLIC_PADDLE_CLIENT_TOKEN', 'test_token');

  initializePaddleMock.mockImplementation(async options => {
    options.eventCallback?.(checkoutCompletedEvent);
    return { Checkout: { open: vi.fn() } };
  });

  const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  const { getPaddleInstance } = await import('./paddle');

  await getPaddleInstance();

  return consoleLog;
}

describe('getPaddleInstance', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([
    {
      nodeEnv: 'production' as const,
      expectedLogCount: 0,
      description: 'does not log Paddle events in production',
    },
    {
      nodeEnv: 'development' as const,
      expectedLogCount: 1,
      description: 'logs Paddle events in development for local debugging',
    },
  ])('$description', async ({ nodeEnv, expectedLogCount }) => {
    const consoleLog = await loadPaddleInstance(nodeEnv);

    expect(consoleLog).toHaveBeenCalledTimes(expectedLogCount);

    if (expectedLogCount > 0) {
      expect(consoleLog).toHaveBeenCalledWith('Paddle Event:', checkoutCompletedEvent);
    }

    consoleLog.mockRestore();
  });
});
