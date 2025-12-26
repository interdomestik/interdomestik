export type SendThankYouLetterParams = {
  email: string;
  memberName: string;
  memberNumber: string;
  planName: string;
  planPrice: string;
  planInterval: string;
  memberSince: Date;
  expiresAt: Date;
  locale?: 'en' | 'sq';
};

export type PreviewThankYouLetterParams = {
  memberName: string;
  memberNumber: string;
  planName: string;
  planPrice: string;
  planInterval: string;
  locale?: 'en' | 'sq';
};
