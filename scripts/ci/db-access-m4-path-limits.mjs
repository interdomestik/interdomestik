// Engineering reserve only; actual process RSS is still governed by the existing
// 6-GiB monitor. These limits never authorize truncation or partial completion.
export const M4_PATH_LIMITS = Object.freeze({
  encodedBytes: 64 * 1024 * 1024,
  scopes: 65536,
  records: 131072,
  metadata: 65536,
});
