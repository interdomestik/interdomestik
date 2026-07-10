import { validateItem } from './item.mjs';

const SAFETY_ERROR = {
  key: 'safeEvidenceConfirmed',
  code: 'required',
  message: 'Konfirmo se kjo paketë përmban vetëm evidencë të sigurt për repo.',
};

export function validatePacket(packet, decisions = {}, safeEvidenceConfirmed = false) {
  const items = (packet.items ?? []).map(item => ({
    itemId: item.id,
    ...validateItem(item, decisions[item.id] ?? {}),
  }));
  const errors = safeEvidenceConfirmed ? [] : [SAFETY_ERROR];
  const errorCount = items.reduce((count, item) => count + item.errors.length, errors.length);
  return { valid: errorCount === 0, errorCount, errors, items };
}
