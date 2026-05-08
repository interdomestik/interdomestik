import {
  captureCspReports,
  isAcceptedCspReportContentType,
  normalizeCspReportBody,
  readCspReportBody,
} from '@/lib/security/csp-report';
import { enforceRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

function noContent(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(): Promise<Response> {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}

export async function POST(request: Request): Promise<Response> {
  const limited = await enforceRateLimit({
    name: 'api/csp-report',
    limit: 60,
    windowSeconds: 60,
    headers: request.headers,
    productionSensitive: true,
  });
  if (limited) return noContent();

  if (!isAcceptedCspReportContentType(request.headers.get('content-type'))) {
    return new Response(null, { status: 415 });
  }

  try {
    const body = await readCspReportBody(request);
    if (body === null) return noContent();

    const reports = normalizeCspReportBody(JSON.parse(body));
    captureCspReports(reports);
  } catch {
    // Malformed browser reports should not turn report delivery into a user-visible failure.
  }

  return noContent();
}
