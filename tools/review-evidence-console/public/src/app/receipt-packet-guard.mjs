import { validatePacket } from '../validation/packet.mjs';

function exactKeys(record, itemIds) {
  const keys = Object.keys(record).sort((left, right) => left.localeCompare(right));
  const expected = [...itemIds].sort((left, right) => left.localeCompare(right));
  return keys.length === expected.length && expected.every((id, index) => id === keys[index]);
}

export function importedReceiptMatchesPacket(receipt, packet, validateContent = false) {
  const itemIds = packet.itemIds ?? packet.items?.map(item => item.id) ?? [];
  if (!exactKeys(receipt.decisions, itemIds) || !exactKeys(receipt.structuredResponses, itemIds)) {
    return false;
  }
  const hasValidationContract = packet.items?.every(item => Array.isArray(item.baseFields));
  if (!validateContent || !hasValidationContract) return true;
  const decisions = Object.fromEntries(
    itemIds.map(id => ({
      [id]: { ...receipt.decisions[id], responses: receipt.structuredResponses[id] },
    }))
  );
  return validatePacket(packet, decisions, true).valid;
}
