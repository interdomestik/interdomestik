import { createHash, generateKeyPairSync, sign } from 'node:crypto';

const keyType = 'sk-ssh-ed25519@openssh.com';
const application = 'ssh:';
const magic = Buffer.from('SSHSIG');
const hash = (algorithm, bytes) => createHash(algorithm).update(bytes).digest();

function u32(number) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(number);
  return bytes;
}

function field(value) {
  const bytes = Buffer.from(value);
  return Buffer.concat([u32(bytes.length), bytes]);
}

// Exercise OpenSSH's FIDO2 SSHSIG wire format with an ephemeral Ed25519 key kept in memory.
// https://github.com/openssh/openssh-portable/blob/master/PROTOCOL.sshsig
// https://github.com/openssh/openssh-portable/blob/master/PROTOCOL.u2f
export function makeTestSigner() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicBlob = Buffer.concat([
    field(keyType),
    field(Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url')),
    field(application),
  ]);
  const key = `${keyType} ${publicBlob.toString('base64')} release-test\n`;
  return {
    key,
    sign(raw, namespace = 'release-phase@interdomestik.com') {
      const signedFields = [field(namespace), field(''), field('sha512')];
      const message = Buffer.concat([magic, ...signedFields, field(hash('sha512', raw))]);
      const flagsAndCounter = Buffer.concat([Buffer.from([0x05]), u32(1)]);
      const authenticatorData = Buffer.concat([
        hash('sha256', application),
        flagsAndCounter,
        hash('sha256', message),
      ]);
      const signature = Buffer.concat([
        field(keyType),
        field(sign(null, authenticatorData, privateKey)),
        flagsAndCounter,
      ]);
      const wire = Buffer.concat([
        magic,
        u32(1),
        field(publicBlob),
        ...signedFields,
        field(signature),
      ]);
      const body = wire
        .toString('base64')
        .match(/.{1,70}/gu)
        .join('\n');
      return Buffer.from(`-----BEGIN SSH SIGNATURE-----\n${body}\n-----END SSH SIGNATURE-----\n`);
    },
  };
}
