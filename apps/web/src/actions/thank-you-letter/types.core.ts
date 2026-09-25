export type ConfirmationLocale = 'en' | 'sq' | 'mk' | 'sr';

export function isConfirmationLocale(value: unknown): value is ConfirmationLocale {
  return value === 'en' || value === 'sq' || value === 'mk' || value === 'sr';
}

export type SendThankYouLetterParams = {
  email: string;
  memberName: string;
  memberNumber: string;
  planName: string;
  planPrice: string;
  planInterval: string;
  memberSince: Date;
  expiresAt: Date;
  providerReference: string;
  tenantId: string;
  locale: ConfirmationLocale;
  idempotencyKey: string;
};

export type PreparedThankYouLetter = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendPreparedThankYouLetterParams = {
  request: PreparedThankYouLetter;
  providerReference: string;
  tenantId: string;
  idempotencyKey: string;
};

export type PreviewThankYouLetterParams = {
  memberName: string;
  memberNumber: string;
  planName: string;
  planPrice: string;
  planInterval: string;
  memberSince: Date;
  expiresAt: Date;
  providerReference: string;
  tenantId: string;
  locale: ConfirmationLocale;
};
