// Raw Git data only. Parsing a batch never creates source/runtime authority.
export const MAX_GIT_BLOB_BATCH_BYTES = 32 * 1024 * 1024;
const fail = reason => {
  throw Error('incomplete: Git blob batch ' + reason);
};

export function gitBlobBatchRequest(oids) {
  if (
    !Array.isArray(oids) ||
    oids.length > 4096 ||
    new Set(oids).size !== oids.length ||
    oids.some(oid => typeof oid !== 'string' || !/^[a-f0-9]{40}$/u.test(oid))
  )
    fail('request');
  const request = Buffer.from(oids.length ? oids.join('\n') + '\n' : '');
  if (request.length > 1024 * 1024) fail('request bound');
  return request;
}

export function decodeGitBlobBatch(output, oids) {
  gitBlobBatchRequest(oids);
  if (!Buffer.isBuffer(output) || output.length > MAX_GIT_BLOB_BATCH_BYTES)
    fail('binary output bound');
  const blobs = new Map();
  let offset = 0;
  for (const oid of oids) {
    const end = output.indexOf(10, offset);
    if (end < offset || end - offset > 128) fail('header bound');
    const header = output.subarray(offset, end);
    if (header.some(byte => byte > 127)) fail('non-ASCII header');
    const match = /^([a-f0-9]{40}) blob (0|[1-9][0-9]*)$/u.exec(header.toString('ascii'));
    if (!match || match[1] !== oid) fail('object order or kind');
    const length = Number(match[2]);
    if (!Number.isSafeInteger(length) || length > MAX_GIT_BLOB_BATCH_BYTES) fail('size');
    offset = end + 1;
    const next = offset + length;
    if (next >= output.length || output[next] !== 10) fail('payload or terminator');
    blobs.set(oid, output.subarray(offset, next));
    offset = next + 1;
  }
  if (offset !== output.length) fail('extra or trailing output');
  return blobs;
}
