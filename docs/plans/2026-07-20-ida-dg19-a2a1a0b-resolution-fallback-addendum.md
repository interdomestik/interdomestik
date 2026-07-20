# IDA-DG19-A2a1a0b — Resolution Fallback Addendum

Status: ACCEPTED_CLARIFICATION
Slice: IDA-UI03a2-P0a1a0b
Canonical gate SHA-256: `a5ffbb84f90b9c58bd840e7b171f5bc19506b4adb91beb46fe37029c84ec5c54`
Authority base: `343b8f96c9fe8e8ddc38f5c4197f4fdcd44ecd0a`

The preferred dependency resolver remains native `import.meta.resolve`. The repository's
mandated `tsx --test` lane transpiles these TypeScript modules as CommonJS and does not
provide `import.meta.resolve`; only in that condition, `createRequire` may resolve the same
three gate-owned package export specifiers. A resolved `.cjs` artifact is normalized to the
corresponding `.js` artifact before the existing exact suffix, real-path, regular-file,
identity, size and SHA-256 checks run.

This compatibility path cannot accept caller input, a fourth specifier, another package
version, an alternate source hash, a raw root or a non-local URL. It grants no database,
network, provider, migration-execution or pending-selection authority. The three canonical
source hashes and all other gate contracts remain unchanged.
