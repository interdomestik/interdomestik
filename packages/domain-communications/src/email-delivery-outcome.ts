import { reportServerError } from './server-error';
import { z } from 'zod';
import type { EmailTemplate } from './email/templates/types';
import type { DeliveryFailure, DeliveryOutcome } from './delivery-outcome';
import { providerField, providerStatus } from './delivery-outcome';

type Mail = EmailTemplate & { from: string; to: string | string[] };

const SMTP_PRE_ACCEPTANCE_CODES = new Set([
  'EAUTH',
  'ENOAUTH',
  'EOAUTH2',
  'EDNS',
  'ETLS',
  'EENVELOPE',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
]);
const SMTP_NETWORK_CODES = new Set(['ECONNECTION', 'ESOCKET', 'ECONNRESET', 'EPIPE', 'EMESSAGE']);
const SMTP_PRE_ACCEPTANCE_COMMANDS =
  /^(?:EHLO|HELO|LHLO|STARTTLS|AUTH|MAIL FROM|RCPT TO)(?:[ :]|$)/;

export function smtpDeliveryFailure(error: unknown): DeliveryFailure {
  const code = providerField(error, 'code');
  const command = providerField(error, 'command');
  const syscall = providerField(error, 'syscall');
  const status = providerStatus(providerField(error, 'responseCode'));
  if (code === 'ETIMEDOUT' || providerField(error, 'errno') === 'ETIMEDOUT') {
    return emailTimeoutFailure('smtp');
  }
  const reportedCode =
    typeof code === 'string' &&
    (SMTP_PRE_ACCEPTANCE_CODES.has(code) || SMTP_NETWORK_CODES.has(code))
      ? code
      : undefined;
  const smtpCommand = typeof command === 'string' ? command : '';
  // Nodemailer also reports CONN for a socket error or close after DATA.
  const beforeAcceptance =
    !/^DATA\b/.test(smtpCommand) &&
    (syscall === 'connect' ||
      SMTP_PRE_ACCEPTANCE_COMMANDS.test(smtpCommand) ||
      (reportedCode !== undefined && SMTP_PRE_ACCEPTANCE_CODES.has(reportedCode)));

  return {
    ok: false,
    retryable: !beforeAcceptance || status === undefined || status < 500,
    ambiguous: !beforeAcceptance,
    preAcceptance: beforeAcceptance,
    code: beforeAcceptance ? 'smtp_pre_acceptance' : 'smtp_ambiguous',
    detail: ['smtp', reportedCode, status].filter(value => value !== undefined).join(' '),
  };
}

export function emailTimeoutFailure(transport?: 'smtp' | 'resend'): DeliveryFailure {
  return {
    ok: false,
    retryable: true,
    ambiguous: true,
    preAcceptance: false,
    code: 'timeout',
    detail: transport ? `${transport} timeout` : 'email timeout',
  };
}

const RESEND_PRE_ACCEPTANCE_STATUSES = new Set([400, 401, 403, 422, 429]);
const RESEND_PRE_REQUEST_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
]);
const resendReceipt = z.object({ id: z.string().min(1) });

export async function sendResendOutcome(
  apiKey: string,
  mail: Mail,
  idempotencyKey: string,
  signal: AbortSignal
): Promise<DeliveryOutcome<'resend'>> {
  try {
    // The SDK replaces connection failures with application_error, losing the cause.
    const baseUrl = process.env.RESEND_BASE_URL || 'https://api.resend.com';
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ ...mail, to: Array.isArray(mail.to) ? mail.to : [mail.to] }),
      signal,
      redirect: 'error',
    });
    if (!response.ok) {
      const { status } = response;
      const preAcceptance = RESEND_PRE_ACCEPTANCE_STATUSES.has(status);
      return {
        ok: false,
        retryable: status >= 500 || [408, 409, 429].includes(status),
        ambiguous: !preAcceptance,
        preAcceptance,
        code: 'resend_failed',
        detail: `resend ${status}`,
      };
    }
    if (resendReceipt.safeParse(await response.json()).success) {
      return { ok: true, transport: 'resend' };
    }
  } catch (error) {
    signal.throwIfAborted();
    reportServerError('Resend delivery failed', error);
    const code =
      providerField(providerField(error, 'cause'), 'code') ?? providerField(error, 'code');
    if (typeof code === 'string' && RESEND_PRE_REQUEST_CODES.has(code)) {
      return {
        ok: false,
        retryable: true,
        ambiguous: false,
        preAcceptance: true,
        code: 'resend_pre_acceptance',
        detail: `resend ${code}`,
      };
    }
  }
  return {
    ok: false,
    retryable: true,
    ambiguous: true,
    preAcceptance: false,
    code: 'resend_unknown',
    detail: 'resend',
  };
}
