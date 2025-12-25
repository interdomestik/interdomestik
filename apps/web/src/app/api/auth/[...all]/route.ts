import { auth } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { toNextJsHandler } from 'better-auth/next-js';

const handler = toNextJsHandler(auth);

export async function GET(req: Request) {
  const limited = await enforceRateLimit({
    name: 'api/auth',
    limit: 30,
    windowSeconds: 60,
    headers: req.headers,
  });
  if (limited) return limited;
  return handler.GET(req as any);
}

export async function POST(req: Request) {
  const limited = await enforceRateLimit({
    name: 'api/auth',
    limit: 15,
    windowSeconds: 60,
    headers: req.headers,
  });
  if (limited) return limited;
  return handler.POST(req as any);
}
