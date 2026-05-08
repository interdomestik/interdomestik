import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  captureMessage: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: hoisted.captureMessage,
}));

import {
  captureCspReports,
  isAcceptedCspReportContentType,
  normalizeCspReportBody,
} from './csp-report';

describe('csp-report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts CSP report content types only', () => {
    expect(isAcceptedCspReportContentType('application/csp-report')).toBe(true);
    expect(isAcceptedCspReportContentType('application/reports+json; charset=utf-8')).toBe(true);
    expect(isAcceptedCspReportContentType('application/json')).toBe(false);
    expect(isAcceptedCspReportContentType(null)).toBe(false);
  });

  it('normalizes legacy reports without query strings or script samples', () => {
    const [report] = normalizeCspReportBody({
      'csp-report': {
        'blocked-uri': 'https://tracker.example/script.js?token=secret',
        'document-uri': 'https://app.example/member/help?otp=123',
        disposition: 'report',
        referrer: 'https://ref.example/path?session=secret',
        'script-sample': 'secret inline script',
        'source-file': 'https://cdn.example/source.js?token=secret',
        'violated-directive': 'script-src-elem https:',
        'original-policy': 'x'.repeat(700),
      },
    });

    expect(report).toMatchObject({
      blockedHost: 'tracker.example',
      blockedUri: 'https://tracker.example/script.js',
      documentHost: 'app.example',
      documentUri: 'https://app.example/member/help',
      referrer: 'https://ref.example/path',
      sourceFile: 'https://cdn.example/source.js',
      violatedDirective: 'script-src-elem',
    });
    expect(report.originalPolicy).toHaveLength(512);
    expect(JSON.stringify(report)).not.toContain('script-sample');
    expect(JSON.stringify(report)).not.toContain('secret');
  });

  it('captures warning events with stable CSP tags and fingerprint', () => {
    const [report] = normalizeCspReportBody({
      'csp-report': {
        'blocked-uri': 'https://tracker.example/script.js',
        'document-uri': 'https://app.example/member/help',
        disposition: 'report',
        'violated-directive': 'script-src-elem https:',
      },
    });

    captureCspReports([report]);

    expect(hoisted.captureMessage).toHaveBeenCalledWith('csp.violation', {
      level: 'warning',
      tags: {
        'csp.directive': 'script-src-elem',
        'csp.disposition': 'report',
        'csp.blocked_host': 'tracker.example',
        'csp.document_host': 'app.example',
      },
      fingerprint: ['csp-violation', 'script-src-elem', 'tracker.example'],
      extra: report,
    });
  });
});
