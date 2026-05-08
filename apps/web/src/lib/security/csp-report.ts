import * as Sentry from '@sentry/nextjs';

const MAX_ORIGINAL_POLICY_LENGTH = 512;
export const MAX_CSP_REPORT_BODY_BYTES = 16 * 1024;
export const MAX_CSP_REPORTS_PER_REQUEST = 10;

const ACCEPTED_CONTENT_TYPES = new Set(['application/csp-report', 'application/reports+json']);

type CspReportBody = {
  'csp-report'?: Record<string, unknown>;
};

type ReportingApiBody = Array<{
  type?: unknown;
  body?: Record<string, unknown>;
}>;

type NormalizedCspReport = {
  blockedHost: string;
  blockedUri: string;
  disposition: string;
  documentHost: string;
  documentUri: string;
  lineNumber?: number;
  originalPolicy?: string;
  referrer?: string;
  sourceFile?: string;
  violatedDirective: string;
};

export type CspDirectiveFamily = 'script' | 'other';

export type CspFirstPartyClassification = {
  directiveFamily: CspDirectiveFamily;
  firstParty: boolean;
  reason:
    | 'inline'
    | 'same-document-host'
    | 'extension-origin'
    | 'opaque-origin'
    | 'data-or-blob-origin'
    | 'third-party-host';
};

export function isAcceptedCspReportContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  return ACCEPTED_CONTENT_TYPES.has(contentType.split(';')[0].trim().toLowerCase());
}

export async function readCspReportBody(request: Request): Promise<string | null> {
  const contentLength = request.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_CSP_REPORT_BODY_BYTES) return null;

  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_CSP_REPORT_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(body);
}

function stripQueryString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return '';

  try {
    const parsed = new URL(value);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return value.split('?')[0].split('#')[0];
  }
}

function hostFromUri(value: string): string {
  try {
    return new URL(value).host || 'none';
  } catch {
    return value === '' ? 'none' : 'opaque';
  }
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function getCspDirectiveFamily(violatedDirective: string): CspDirectiveFamily {
  return violatedDirective === 'script-src' ||
    violatedDirective === 'script-src-elem' ||
    violatedDirective === 'script-src-attr'
    ? 'script'
    : 'other';
}

function isExtensionUri(value: string): boolean {
  return (
    value.startsWith('chrome-extension:') ||
    value.startsWith('moz-extension:') ||
    value.startsWith('safari-extension:') ||
    value.startsWith('safari-web-extension:')
  );
}

function isDataOrBlobUri(value: string): boolean {
  return value.startsWith('data:') || value.startsWith('blob:');
}

export function classifyCspReport(report: NormalizedCspReport): CspFirstPartyClassification {
  const directiveFamily = getCspDirectiveFamily(report.violatedDirective);

  if (report.blockedUri === 'inline') {
    return { directiveFamily, firstParty: true, reason: 'inline' };
  }

  if (isExtensionUri(report.blockedUri)) {
    return { directiveFamily, firstParty: false, reason: 'extension-origin' };
  }

  if (isDataOrBlobUri(report.blockedUri)) {
    return { directiveFamily, firstParty: false, reason: 'data-or-blob-origin' };
  }

  if (
    report.blockedHost === 'none' ||
    report.blockedHost === 'opaque' ||
    report.blockedUri === 'null'
  ) {
    return { directiveFamily, firstParty: false, reason: 'opaque-origin' };
  }

  if (report.blockedHost === report.documentHost) {
    return { directiveFamily, firstParty: true, reason: 'same-document-host' };
  }

  return { directiveFamily, firstParty: false, reason: 'third-party-host' };
}

function normalizeReportPayload(payload: Record<string, unknown>): NormalizedCspReport {
  const blockedUri = stripQueryString(payload['blocked-uri'] ?? payload.blockedURL);
  const documentUri = stripQueryString(payload['document-uri'] ?? payload.documentURL);
  const originalPolicy =
    typeof (payload['original-policy'] ?? payload.originalPolicy) === 'string'
      ? String(payload['original-policy'] ?? payload.originalPolicy).slice(
          0,
          MAX_ORIGINAL_POLICY_LENGTH
        )
      : undefined;
  const violatedDirective = payload['violated-directive'] ?? payload.effectiveDirective;

  return {
    blockedHost: hostFromUri(blockedUri),
    blockedUri,
    disposition: 'report',
    documentHost: hostFromUri(documentUri),
    documentUri,
    lineNumber: optionalNumber(payload['line-number']),
    originalPolicy,
    referrer: stripQueryString(payload.referrer),
    sourceFile: stripQueryString(payload['source-file'] ?? payload.sourceFile),
    violatedDirective:
      typeof violatedDirective === 'string' ? violatedDirective.split(/\s+/)[0] : 'unknown',
  };
}

export function normalizeCspReportBody(body: unknown): NormalizedCspReport[] {
  if (Array.isArray(body)) {
    return (body as ReportingApiBody)
      .filter(item => item?.type === 'csp-violation' && item.body)
      .slice(0, MAX_CSP_REPORTS_PER_REQUEST)
      .map(item => normalizeReportPayload(item.body as Record<string, unknown>));
  }

  if (body && typeof body === 'object') {
    const payload = (body as CspReportBody)['csp-report'] ?? body;
    if (payload && typeof payload === 'object') {
      return [normalizeReportPayload(payload as Record<string, unknown>)];
    }
  }

  return [];
}

export function captureCspReports(reports: NormalizedCspReport[]): void {
  for (const report of reports) {
    const classification = classifyCspReport(report);

    Sentry.captureMessage('csp.violation', {
      level: 'warning',
      tags: {
        'csp.directive': report.violatedDirective,
        'csp.directive_family': classification.directiveFamily,
        'csp.disposition': report.disposition,
        'csp.blocked_host': report.blockedHost,
        'csp.document_host': report.documentHost,
        'csp.first_party': String(classification.firstParty),
        'csp.first_party_reason': classification.reason,
      },
      fingerprint: ['csp-violation', report.violatedDirective, report.blockedHost],
      extra: report,
    });
  }
}
