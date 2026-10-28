/** Fixed receipt operations only; no database handle or SQL callback crosses this boundary. */
export type PaddleReceiptIdentity = {
  eventType: string | undefined;
  processingScopeKey: string;
  dedupeKey: string;
  payloadHash: string;
};

export type PaddleReceiptInsert = {
  id: string;
  tenantId: string | null;
  provider: 'paddle';
  processingScopeKey: string;
  dedupeKey: string;
  eventType: string | null;
  eventId: string | null;
  providerTransactionId?: string | null;
  signatureValid: boolean;
  eventTimestamp: Date | null;
  payloadHash: string;
  payload: Record<string, unknown>;
};

/**
 * A mounted privileged implementation must bind all inputs to the authenticated
 * raw event and canonical lookup before exposing these fixed operations.
 * Supplying this interface alone is not evidence of provider authentication.
 */
export type PaddleWebhookReceiptStore = {
  insert(input: PaddleReceiptInsert): Promise<{ id: string }[]>;
  reclaim(input: PaddleReceiptIdentity): Promise<{ id: string } | null>;
  findRecoverableLease(input: PaddleReceiptIdentity): Promise<{ id: string } | null>;
  mark(input: {
    id: string;
    processedAt: Date;
    processingResult: 'ok' | 'error' | 'retryable_error';
    error: string | null;
  }): Promise<void>;
};
