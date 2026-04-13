import { initializePaddle, type Paddle } from '@paddle/paddle-js';

let paddleInstance: Paddle | null = null;
let paddleInstanceCacheKey: string | null = null;

export type PublicPaddleInitConfig = Readonly<{
  environment: 'sandbox' | 'production';
  clientToken: string;
}>;

export async function getPaddleInstance(config?: PublicPaddleInitConfig) {
  const clientToken = config?.clientToken ?? process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  const environment =
    config?.environment ??
    (process.env.NEXT_PUBLIC_PADDLE_ENV === 'production' ? 'production' : 'sandbox');
  const cacheKey = clientToken ? `${environment}:${clientToken}` : null;

  if (paddleInstance && paddleInstanceCacheKey === cacheKey) {
    return paddleInstance;
  }

  if (!clientToken) {
    console.error('Paddle Client Token missing');
    return null;
  }

  try {
    const paddle = await initializePaddle({
      environment,
      token: clientToken,
      eventCallback: (data: unknown) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('Paddle Event:', data);
        }
      },
    });

    if (paddle) {
      paddleInstance = paddle;
      paddleInstanceCacheKey = cacheKey;
    }

    return paddleInstance;
  } catch (err) {
    console.error('Failed to initialize Paddle:', err);
    return null;
  }
}

export function resetPaddleInstanceForTests(): void {
  paddleInstance = null;
  paddleInstanceCacheKey = null;
}
