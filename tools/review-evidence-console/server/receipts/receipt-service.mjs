import { verifyReceipt } from '../../public/src/state/receipt-builder.mjs';
import { buildServerCorrection, buildServerReceipt } from './receipt-envelope.mjs';
import { signReceipt, verifySignedReceipt } from './receipt-signature.mjs';

const invalid = code => ({ ok: false, code });
const withoutAttestation = receipt => {
  const unsigned = { ...receipt };
  delete unsigned.attestation;
  return unsigned;
};

export function createReceiptService({ keyring, now = () => new Date().toISOString() }) {
  function trustedKeys() {
    const compare = (left, right) => left.id.localeCompare(right.id, 'en');
    const keys = [...keyring.publicKeys]
      .map(([id, value]) => ({
        id,
        fingerprint: value.fingerprint,
        publicKeySpki: value.publicKeySpki,
      }))
      .sort(compare);
    return { version: 1, algorithm: 'Ed25519', keys };
  }
  async function create(account, bundle, submission) {
    try {
      const payload = await buildServerReceipt(account, bundle, submission, { now });
      return { ok: true, value: await signReceipt(payload, keyring) };
    } catch {
      return invalid('invalid_request');
    }
  }

  async function verify(receipt) {
    const signature = await verifySignedReceipt(receipt, keyring);
    if (!signature.ok) return signature;
    const unsigned = withoutAttestation(receipt);
    const content = await verifyReceipt(unsigned);
    return content.ok ? { ok: true, value: receipt } : invalid('invalid_receipt');
  }

  async function correct(account, bundle, submission) {
    const previous = await verify(submission?.previousReceipt);
    if (!previous.ok) return invalid('invalid_receipt');
    try {
      const unsigned = withoutAttestation(previous.value);
      const payload = await buildServerCorrection(account, bundle, submission, unsigned, { now });
      return { ok: true, value: await signReceipt(payload, keyring) };
    } catch {
      return invalid('invalid_request');
    }
  }

  return Object.freeze({ correct, create, trustedKeys, verify });
}
