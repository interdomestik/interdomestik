export type SubscriptionSession = {
  user: {
    id: string;
  };
};

export type PaymentUpdateUrlResult =
  | { url: string; error?: undefined }
  | { error: string; url?: undefined };

export type CancelSubscriptionResult =
  | { success: true; error?: undefined }
  | { error: string; success?: undefined };
