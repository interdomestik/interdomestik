import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { initializePaddleMock, loadPaddleScript, closure } = vi.hoisted(() => ({
  initializePaddleMock: vi.fn(),
  loadPaddleScript: vi.fn(),
  closure: { keepParkedPath: false },
}));
const checkoutCompletedEvent = { type: 'checkout.completed' };

vi.mock('@paddle/paddle-js', () => {
  loadPaddleScript();
  return { initializePaddle: initializePaddleMock };
});

vi.mock('./paddle-closed', async importOriginal => {
  const actual = await importOriginal<typeof import('./paddle-closed')>();
  return {
    ...actual,
    get PADDLE_CLOSED() {
      return closure.keepParkedPath ? false : actual.PADDLE_CLOSED;
    },
  };
});

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

  afterEach(() => {
    closure.keepParkedPath = false;
    vi.unstubAllEnvs();
  });

  it('returns null before importing or loading Paddle.js with configured tokens', async () => {
    vi.stubEnv('NEXT_PUBLIC_PADDLE_CLIENT_TOKEN', 'paddle-client-token-fixture');
    const { getPaddleInstance } = await import('./paddle');

    await expect(getPaddleInstance()).resolves.toBeNull();
    await expect(
      getPaddleInstance({ environment: 'sandbox', clientToken: 'explicit-paddle-token-fixture' })
    ).resolves.toBeNull();
    expect(loadPaddleScript).not.toHaveBeenCalled();
    expect(initializePaddleMock).not.toHaveBeenCalled();
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
    closure.keepParkedPath = true;
    const consoleLog = await loadPaddleInstance(nodeEnv);

    expect(consoleLog).toHaveBeenCalledTimes(expectedLogCount);

    if (expectedLogCount > 0) {
      expect(consoleLog).toHaveBeenCalledWith('Paddle Event:', checkoutCompletedEvent);
    }

    consoleLog.mockRestore();
  });
});
