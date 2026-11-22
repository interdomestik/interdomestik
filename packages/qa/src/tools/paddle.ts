import type { ToolRepoArgs } from '../utils/tool-repo-root.js';

type PaddleResourceArgs = {
  resource: 'subscriptions' | 'customers' | 'products' | 'prices';
  id: string;
};

export async function getPaddleResource(_args: ToolRepoArgs & PaddleResourceArgs) {
  return {
    content: [{ type: 'text', text: 'Paddle is closed.' }],
    isError: true,
    structuredContent: { status: 'error', tool: 'get_paddle_resource', code: 'PADDLE_CLOSED' },
  };
}
