import type { ErrorResponse, Resend } from 'resend';
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
    code: beforeAcceptance ? 'smtp_pre_acceptance' : 'smtp_ambiguous',
    detail: ['smtp', reportedCode, status].filter(value => value !== undefined).join(' '),
  };
}

export function emailTimeoutFailure(transport?: 'smtp' | 'resend'): DeliveryFailure {
  return {
    ok: false,
    retryable: true,
    ambiguous: true,
    code: 'timeout',
    detail: transport ? `${transport} timeout` : 'email timeout',
  };
}

const RESEND_ERRORS = {
  missing_required_field: 422,
  invalid_idempotency_key: 400,
  invalid_idempotent_request: 409,
  concurrent_idempotent_requests: 409,
  invalid_access: 422,
  invalid_parameter: 422,
  invalid_region: 422,
  rate_limit_exceeded: 429,
  missing_api_key: 401,
  invalid_api_Key: 403,
  invalid_from_address: 403,
  validation_error: 403,
  not_found: 404,
  method_not_allowed: 405,
  application_error: 500,
  internal_server_error: 500,
} satisfies Record<ErrorResponse['name'], number>;

function resendDeliveryFailure(name?: ErrorResponse['name']): DeliveryFailure {
  if (name === undefined || !Object.hasOwn(RESEND_ERRORS, name)) {
    return {
      ok: false,
      retryable: true,
      ambiguous: true,
      code: 'resend_unknown',
      detail: 'resend',
    };
  }

  const status = RESEND_ERRORS[name];
  return {
    ok: false,
    retryable: status >= 500 || status === 429 || name === 'concurrent_idempotent_requests',
    ambiguous: status >= 500,
    code: 'resend_failed',
    detail: `resend ${name} ${status}`,
  };
}

export async function sendResendOutcome(
  client: Resend,
  mail: Mail,
  idempotencyKey: string
): Promise<DeliveryOutcome<'resend'>> {
  try {
    const { data, error } = await client.emails.send(mail, { idempotencyKey });
    if (error) return resendDeliveryFailure(error.name);
    if (data?.id) return { ok: true, transport: 'resend' };
    return resendDeliveryFailure();
  } catch {
    return resendDeliveryFailure();
  }
}
