import { canonicalStringify } from './canonical-json.mjs';

export const RECEIPT_SIGNATURE_DOMAIN = 'REC02-RECEIPT-SIGNATURE-V1\0';

export function canonicalReceiptBytes(value) {
  return new TextEncoder().encode(RECEIPT_SIGNATURE_DOMAIN + canonicalStringify(value));
}
