import { buildReceipt as defaultBuildReceipt } from '../state/receipt-builder.mjs';
import { validatePacket } from '../validation/packet.mjs';

function receiptInput(bundle, state, authorityDisclaimer) {
  const decisions = {};
  const structuredResponses = {};
  for (const [itemId, decision] of Object.entries(state.decisions)) {
    const { responses = {}, ...answer } = decision;
    decisions[itemId] = answer;
    structuredResponses[itemId] = responses;
  }
  const correction = state.correction;
  return {
    schemaVersion: 1,
    packetId: bundle.packet.id,
    packetVersion: bundle.packet.version,
    assignmentId: bundle.assignment.id,
    reviewerFixtureId: bundle.reviewer.id,
    reviewerDisplayName: bundle.reviewer.displayName,
    reviewerRole: bundle.reviewer.role,
    packetRole: bundle.packet.reviewerRole,
    authorityDisclaimer,
    decisions,
    structuredResponses,
    ...(correction
      ? {
          previousReceipt: correction.previousReceipt,
          correctionItemId: correction.itemId,
          correctionReason: correction.reason,
          correctionImpact: correction.impact,
        }
      : {}),
  };
}

export function createSubmissionController({
  bundle,
  authorityDisclaimer = 'Local fixture review only; not runtime authority.',
  buildReceipt = defaultBuildReceipt,
  receiptStore,
  onNavigate = () => {},
  onStatus = () => {},
}) {
  let submitting = false;
  let error = null;
  async function submit(state, safeEvidenceConfirmed) {
    if (submitting) return { ok: false, code: 'submitting' };
    const validation = validatePacket(
      bundle.packet,
      state.decisions,
      safeEvidenceConfirmed === true
    );
    if (!validation.valid) {
      return {
        ok: false,
        code: 'validation_failed',
        message: 'Complete every required review field.',
        validation,
      };
    }
    submitting = true;
    error = null;
    onStatus({ submitting, error });
    try {
      const receipt = await buildReceipt(receiptInput(bundle, state, authorityDisclaimer));
      const saved = await receiptStore.save(receipt);
      if (!saved.ok) {
        error = saved;
        return saved;
      }
      onNavigate(receipt.receiptId);
      return saved;
    } catch {
      error = { ok: false, code: 'unavailable', message: 'Receipt could not be created.' };
      return error;
    } finally {
      submitting = false;
      onStatus({ submitting, error });
    }
  }
  return { submit, getStatus: () => ({ submitting, error }) };
}
