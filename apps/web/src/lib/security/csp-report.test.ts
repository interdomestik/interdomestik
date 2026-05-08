import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  captureMessage: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: hoisted.captureMessage,
}));

import {
  classifyCspReport,
  captureCspReports,
  getCspDirectiveFamily,
  isAcceptedCspReportContentType,
  normalizeCspReportBody,
} from './csp-report';

type ReportingApiCspReportOptions = {
  documentURL?: string;
  effectiveDirective?: string;
};

function reportingApiCspReport(blockedURL: string, options: ReportingApiCspReportOptions = {}) {
  return {
    type: 'csp-violation',
    body: {
      blockedURL,
      documentURL: options.documentURL ?? 'https://ks.example/sq',
      effectiveDirective: options.effectiveDirective ?? 'script-src-elem',
    },
  };
}

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
        'csp.directive_family': 'script',
        'csp.disposition': 'report',
        'csp.blocked_host': 'tracker.example',
        'csp.document_host': 'app.example',
        'csp.first_party': 'false',
        'csp.first_party_reason': 'third-party-host',
      },
      fingerprint: ['csp-violation', 'script-src-elem', 'tracker.example'],
      extra: report,
    });
  });

  it('tags inline and same-host reports as first-party', () => {
    const reports = normalizeCspReportBody([
      reportingApiCspReport('inline', {
        documentURL: 'https://app.example/sq',
        effectiveDirective: 'script-src',
      }),
      reportingApiCspReport('https://app.example/_next/static/chunks/app.js', {
        documentURL: 'https://app.example/sq',
      }),
      reportingApiCspReport('chrome-extension://example/script.js', {
        documentURL: 'https://app.example/sq',
      }),
    ]);

    captureCspReports(reports);

    expect(hoisted.captureMessage.mock.calls.map(call => call[1].tags['csp.first_party'])).toEqual([
      'true',
      'true',
      'false',
    ]);
    expect(
      hoisted.captureMessage.mock.calls.map(call => call[1].tags['csp.first_party_reason'])
    ).toEqual(['inline', 'same-document-host', 'extension-origin']);
    expect(
      hoisted.captureMessage.mock.calls.map(call => call[1].tags['csp.directive_family'])
    ).toEqual(['script', 'script', 'script']);
  });

  it.each([
    ['script-src', 'script'],
    ['script-src-elem', 'script'],
    ['script-src-attr', 'script'],
    ['style-src', 'other'],
    ['default-src', 'other'],
    ['unknown', 'other'],
  ] as const)('maps %s to the %s directive family', (directive, expected) => {
    expect(getCspDirectiveFamily(directive)).toBe(expected);
  });

  it('classifies first-party and non-first-party script reports with stable reasons', () => {
    const reports = normalizeCspReportBody([
      reportingApiCspReport('inline', {
        documentURL: 'https://ks.example/sq/register',
        effectiveDirective: 'script-src',
      }),
      reportingApiCspReport('https://ks.example/_next/static/chunks/webpack.js'),
      reportingApiCspReport('moz-extension://extension-id/content.js'),
      reportingApiCspReport('null'),
      reportingApiCspReport('data:text/javascript,alert(1)'),
      reportingApiCspReport('https://www.googletagmanager.com/gtm.js'),
    ]);

    expect(reports.map(report => classifyCspReport(report))).toEqual([
      { directiveFamily: 'script', firstParty: true, reason: 'inline' },
      { directiveFamily: 'script', firstParty: true, reason: 'same-document-host' },
      { directiveFamily: 'script', firstParty: false, reason: 'extension-origin' },
      { directiveFamily: 'script', firstParty: false, reason: 'opaque-origin' },
      { directiveFamily: 'script', firstParty: false, reason: 'data-or-blob-origin' },
      { directiveFamily: 'script', firstParty: false, reason: 'third-party-host' },
    ]);
  });
});
