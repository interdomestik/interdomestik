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
