export function confirmClearReceipt(receiptId, confirmAction = globalThis.confirm) {
  return confirmAction(`Të pastrohet vërtetimi ${receiptId}? Draftet do të ruhen.`);
}
