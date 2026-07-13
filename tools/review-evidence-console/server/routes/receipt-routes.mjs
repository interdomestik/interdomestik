import { hasValidMutationOrigin } from '../auth/origin.mjs';
import { authenticateRequest } from '../auth/session-context.mjs';
import { readJsonBody } from '../http/read-body.mjs';
import { jsonResponse, notFoundResponse, unauthorizedResponse } from '../http/responses.mjs';

export async function routeReceipts(request, pathname, context) {
  if (pathname === '/api/receipts/keys') {
    if (request.method !== 'GET') {
      return jsonResponse(405, { code: 'method_not_allowed' }, { allow: 'GET' });
    }
    const session = await authenticateRequest(request, context);
    return session.ok
      ? jsonResponse(200, context.receiptService.trustedKeys())
      : unauthorizedResponse();
  }
  if (request.method !== 'POST') {
    return jsonResponse(405, { code: 'method_not_allowed' }, { allow: 'POST' });
  }
  if (!hasValidMutationOrigin(request)) return jsonResponse(403, { code: 'forbidden' });
  const session = await authenticateRequest(request, context);
  if (!session.ok) return unauthorizedResponse();
  const body = await readJsonBody(request, 262_144);
  if (!body.ok) return jsonResponse(body.status, { code: body.code });
  if (
    !['/api/receipts', '/api/receipts/correct'].includes(pathname) ||
    typeof body.value.assignmentId !== 'string'
  ) {
    return notFoundResponse();
  }
  const bundle = await context.fixtureService.loadAssignment(
    session.account,
    body.value.assignmentId
  );
  if (!bundle.ok) {
    context.events.emit('role_boundary_denied');
    return notFoundResponse();
  }
  const created =
    pathname === '/api/receipts/correct'
      ? await context.receiptService.correct(session.account, bundle.value, body.value)
      : await context.receiptService.create(session.account, bundle.value, body.value);
  if (!created.ok) context.events.emit('receipt_failed');
  return created.ok
    ? jsonResponse(200, created.value)
    : jsonResponse(created.code === 'invalid_receipt' ? 422 : 400, { code: created.code });
}
