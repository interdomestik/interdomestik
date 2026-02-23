import { billingInvoices, billingLedgerEntries, db, sql } from '@interdomestik/database';
import { nanoid } from 'nanoid';

import { resolveBillingEntityForTenantId, type BillingEntity } from '../paddle-server';
import type { PaddleWebhookAuditDeps } from './types';

type TransactionTotalsPayload = {
  total?: string;
  currencyCode?: string;
  currency_code?: string;
};

type TransactionInvariantPayload = {
  subscriptionId?: string | null;
  subscription_id?: string | null;
  details?: {
    totals?: TransactionTotalsPayload;
  } | null;
};

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeAmount(value: string | null | undefined): string {
  const normalized = normalizeText(value);
  if (!normalized) return '0';
  return /^-?\d+(\.\d+)?$/.test(normalized) ? normalized : '0';
}

function normalizeCurrencyCode(value: string | null | undefined): string {
  const normalized = normalizeText(value);
  if (!normalized) return 'EUR';
  return normalized.toUpperCase();
}

function resolveInvariantScope(params: {
  tenantId?: string | null;
  billingEntity?: BillingEntity | null;
}): { tenantId: string; billingEntity: BillingEntity } {
  const tenantId = normalizeText(params.tenantId);
  if (!tenantId) {
    throw new Error('Missing tenantId for invoice/ledger invariant persistence');
  }

  const mappedEntity = resolveBillingEntityForTenantId(tenantId);
  if (params.billingEntity && mappedEntity && mappedEntity !== params.billingEntity) {
    throw new Error(
      `Billing entity mismatch for tenant ${tenantId}: expected ${mappedEntity}, received ${params.billingEntity}`
    );
  }

  const billingEntity = params.billingEntity ?? mappedEntity;
  if (!billingEntity) {
    throw new Error(`Unable to resolve billing entity for tenant ${tenantId}`);
  }

  return { tenantId, billingEntity };
}

export type PersistInvoiceAndLedgerInvariantsResult =
  | {
      applied: false;
      replayed: false;
      invoiceId: null;
      ledgerEntryId: null;
    }
  | {
      applied: true;
      replayed: boolean;
      invoiceId: string;
      ledgerEntryId: string | null;
    };

export async function persistInvoiceAndLedgerInvariants(
  params: {
    headers: Headers;
    webhookEventRowId: string;
    eventType: string | undefined;
    eventId: string | undefined;
    tenantId?: string | null;
    billingEntity?: BillingEntity | null;
    providerTransactionId?: string | null;
    data: unknown;
  },
  deps: PaddleWebhookAuditDeps = {}
): Promise<PersistInvoiceAndLedgerInvariantsResult> {
  if (params.eventType !== 'transaction.completed') {
    return {
      applied: false,
      replayed: false,
      invoiceId: null,
      ledgerEntryId: null,
    };
  }

  const providerTransactionId = normalizeText(params.providerTransactionId);
  if (!providerTransactionId) {
    throw new Error('Missing provider transaction id for invoice/ledger invariant persistence');
  }

  const { tenantId, billingEntity } = resolveInvariantScope({
    tenantId: params.tenantId,
    billingEntity: params.billingEntity,
  });

  const payload = (params.data ?? {}) as TransactionInvariantPayload;
  const totals = payload.details?.totals || {};
  const amount = normalizeAmount(totals.total);
  const currencyCode = normalizeCurrencyCode(totals.currencyCode || totals.currency_code);
  const subscriptionId = normalizeText(payload.subscriptionId || payload.subscription_id);

  const result = await db.transaction(async tx => {
    const invoiceRows = await tx
      .insert(billingInvoices)
      .values({
        id: nanoid(),
        tenantId,
        billingEntity,
        provider: 'paddle',
        providerTransactionId,
        webhookEventId: params.webhookEventRowId,
        subscriptionId,
        eventId: params.eventId ?? null,
        status: 'posted',
        amountTotal: amount,
        currencyCode,
        metadata: {
          source: 'paddle_webhook',
          eventType: params.eventType,
          eventId: params.eventId ?? null,
        },
      })
      .onConflictDoUpdate({
        target: [
          billingInvoices.tenantId,
          billingInvoices.billingEntity,
          billingInvoices.providerTransactionId,
        ],
        set: {
          updatedAt: sql`${billingInvoices.updatedAt}`,
        },
      })
      .returning({ id: billingInvoices.id });

    const invoiceId = invoiceRows[0]?.id;
    if (!invoiceId) {
      throw new Error('Failed to upsert billing invoice invariant row');
    }

    const ledgerRows = await tx
      .insert(billingLedgerEntries)
      .values({
        id: nanoid(),
        tenantId,
        billingEntity,
        invoiceId,
        webhookEventId: params.webhookEventRowId,
        provider: 'paddle',
        providerTransactionId,
        entryType: 'invoice.posted',
        amount,
        currencyCode,
        metadata: {
          source: 'paddle_webhook',
          eventType: params.eventType,
          eventId: params.eventId ?? null,
        },
      })
      .onConflictDoNothing()
      .returning({ id: billingLedgerEntries.id });

    const ledgerEntryId = ledgerRows[0]?.id ?? null;

    return {
      applied: true as const,
      replayed: ledgerRows.length === 0,
      invoiceId,
      ledgerEntryId,
    };
  });

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorRole: 'system',
      action: result.replayed ? 'billing.invoice.replay_ignored' : 'billing.invoice.posted',
      entityType: 'invoice',
      entityId: result.invoiceId,
      tenantId,
      metadata: {
        billingEntity,
        provider: 'paddle',
        providerTransactionId,
        webhookEventRowId: params.webhookEventRowId,
        eventType: params.eventType,
        eventId: params.eventId ?? null,
        replayed: result.replayed,
      },
      headers: params.headers,
    });
  }

  return result;
}
