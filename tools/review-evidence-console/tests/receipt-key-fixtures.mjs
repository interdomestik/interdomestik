import { createReceiptKeyring, fingerprintPublicKey } from '../server/receipts/keyring.mjs';

export async function createTestReceiptKeyring(id = 'rec_test_01') {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const privateKey = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const publicKey = Buffer.from(await crypto.subtle.exportKey('spki', pair.publicKey));
  return createReceiptKeyring({
    activeKeyId: id,
    privateKeyPkcs8: privateKey.toString('base64url'),
    publicKeys: [
      {
        id,
        publicKeySpki: publicKey.toString('base64url'),
        fingerprint: await fingerprintPublicKey(publicKey),
      },
    ],
  });
}
