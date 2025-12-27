import { initializePaddle, type Paddle } from '@paddle/paddle-js';

let paddleInstance: Paddle | null = null;

export async function getPaddleInstance() {
  if (paddleInstance) return paddleInstance;

  const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;

  if (!clientToken) {
    console.error('Paddle Client Token missing');
    return null;
  }

  try {
    const paddle = await initializePaddle({
      environment: process.env.NEXT_PUBLIC_PADDLE_ENV === 'production' ? 'production' : 'sandbox',
      token: clientToken,
      eventCallback: (data: unknown) => {
        console.log('Paddle Event:', data);
      },
    });

    if (paddle) {
      paddleInstance = paddle;
    }

    return paddleInstance;
  } catch (err) {
    console.error('Failed to initialize Paddle:', err);
    return null;
  }
}
