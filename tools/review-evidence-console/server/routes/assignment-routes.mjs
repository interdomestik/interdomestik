import { authenticateRequest } from '../auth/session-context.mjs';
import { jsonResponse, notFoundResponse, unauthorizedResponse } from '../http/responses.mjs';

export async function routeAssignments(request, pathname, context) {
  if (request.method !== 'GET') {
    return jsonResponse(405, { code: 'method_not_allowed' }, { allow: 'GET' });
  }
  const session = await authenticateRequest(request, context);
  if (!session.ok) return unauthorizedResponse();
  if (pathname === '/api/assignments') {
    const result = await context.fixtureService.listAssignments(session.account);
    if (!result.ok) context.events.emit('role_boundary_denied');
    return result.ok ? jsonResponse(200, result.value) : notFoundResponse();
  }
  const match = pathname.match(/^\/api\/assignments\/([a-z0-9_-]{3,100})$/u);
  if (!match) return notFoundResponse();
  const result = await context.fixtureService.loadAssignment(session.account, match[1]);
  if (!result.ok) context.events.emit('role_boundary_denied');
  return result.ok ? jsonResponse(200, result.value) : notFoundResponse();
}
