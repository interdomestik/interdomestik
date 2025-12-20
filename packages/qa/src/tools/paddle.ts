type PaddleResourceArgs = {
  resource: 'subscriptions' | 'customers' | 'products' | 'prices';
  id: string;
};

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

  const baseUrl = process.env.PADDLE_API_BASE || 'https://api.paddle.com';
  const url = `${baseUrl}/${args.resource}/${encodeURIComponent(args.id)}`;

  try {
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
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to fetch Paddle resource: ${error.message}`,
        },
      ],
    };
  }
}
