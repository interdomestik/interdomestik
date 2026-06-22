type PaddleResourceArgs = {
  resource: 'subscriptions' | 'customers' | 'products' | 'prices';
  id: string;
};

const PADDLE_API_ORIGINS = new Set(['https://api.paddle.com', 'https://sandbox-api.paddle.com']);

function buildPaddleResourceUrl(baseUrl: string, args: PaddleResourceArgs): URL {
  const parsed = new URL(baseUrl);
  if (parsed.username || parsed.password || !PADDLE_API_ORIGINS.has(parsed.origin)) {
    throw new Error('Paddle API base URL is not allowed.');
  }
  const url = new URL(
    `/${encodeURIComponent(args.resource)}/${encodeURIComponent(args.id)}`,
    parsed.origin
  );
  if (!PADDLE_API_ORIGINS.has(url.origin)) {
    throw new Error('Paddle API resource URL is not allowed.');
  }
  return url;
}

export async function getPaddleResource(args: PaddleResourceArgs) {
  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) {
    return {
      content: [
        {
          type: 'text',
          text: 'Paddle API key missing. Set PADDLE_API_KEY to enable Paddle resource checks.',
        },
      ],
    };
  }

  try {
    const baseUrl = process.env.PADDLE_API_BASE || 'https://api.paddle.com';
    const url = buildPaddleResourceUrl(baseUrl, args);
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const body = await response.text();
    if (!response.ok) {
      return {
        content: [
          {
            type: 'text',
            text: `Paddle API error ${response.status}: ${body}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `Paddle resource (${args.resource}) ${args.id}:\n${body}`,
        },
      ],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown Paddle fetch error';
    return {
      content: [
        {
          type: 'text',
          text: `Failed to fetch Paddle resource: ${message}`,
        },
      ],
    };
  }
}
