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
  locale: 'en' | 'sq' | 'mk' | 'sr';
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
  locale: 'en' | 'sq' | 'mk' | 'sr';
};
