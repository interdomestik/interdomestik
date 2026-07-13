import { verifyPassword } from './auth/password.mjs';
import { notFoundResponse, jsonResponse } from './http/responses.mjs';
import { routeAssignments } from './routes/assignment-routes.mjs';
import { routeSession } from './routes/session-routes.mjs';
import { routeReceipts } from './routes/receipt-routes.mjs';
import { silentSecurityEvents } from './security/events.mjs';

const permissiveLimiter = Object.freeze({ consume: () => ({ allowed: true, retryAfter: 0 }) });

export function createPortalHandler({
  registry,
  sessionSecret,
  fixtureService,
  verifyCredentials = verifyPassword,
  limiter = permissiveLimiter,
  now,
  receiptService,
  events = silentSecurityEvents,
}) {
  const context = {
    registry,
    sessionSecret,
    fixtureService,
    verifyCredentials,
    limiter,
    now,
    receiptService,
    events,
  };
  return async function handlePortalRequest(request) {
    try {
      const pathname = new URL(request.url).pathname;
      const session = routeSession(request, pathname, context);
      if (session) return session;
      if (pathname === '/api/assignments' || pathname.startsWith('/api/assignments/')) {
        return routeAssignments(request, pathname, context);
      }
      if (pathname === '/api/receipts' || pathname.startsWith('/api/receipts/')) {
        if (!context.receiptService) return jsonResponse(503, { code: 'service_unavailable' });
        return routeReceipts(request, pathname, context);
      }
      return notFoundResponse();
    } catch {
      return jsonResponse(503, { code: 'service_unavailable' });
    }
  };
}
