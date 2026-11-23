# MODULE — `scripts/ci/screen-contract` (the screen-contract scanner, WP-05)

Created on 2026-11-23 for the WP-05 flip (PR-A, the flip-ready scanner). R-19 asks for it, because the scanner's inputs and refusals change here. It records the module's boundary and the residuals the owner accepted, each with how it would be noticed. It does not repeat the checks' own predicates, which live in the rules and in `screen-contract-check.mjs`.

## Responsibility

`scripts/ci/screen-contract-check.mjs` and this directory judge six checks over a revision pair (base, head): CHK-15a, CHK-15b, CHK-15c, CHK-09 part 1, CHK-22 and A11Y. They run as ESLint rules (`apps/web/eslint/screen-contract/`) over a tree extracted from Git, against the shrink-only baseline of the trusted base.

## Public interface

- CLI: `--base <sha> --head <sha> [--enforcing] [--require-all-enforcing] [--replay] [--report <file>]`.
- Exit codes: `0` clean, `1` an enforcing finding, `2` a scanner error. A scanner error is never a pass.
- Data files, read from the trusted base:
  - `scripts/ci/screen-contract-baseline.json`;
  - `scripts/ci/screen-contract-consent-registry.json` (frozen and empty while CHK-22 enforces);
  - `scripts/ci/screen-contract-rebuilt-screens.json`.

## Invariants

- **The fixed configuration (owner, decision B, 2026-11-23).** Module resolution (`resolution.mjs`, `specifiers.mjs`) models one build configuration, today's, and refuses every other with exit 2 and the sentence "a change to it needs a scanner PR first (WP-05 flip, D-1 fixed configuration)". It pins:
  - `apps/web/next.config.mjs` and its helper, by sha256;
  - each tsconfig's `@/*` mapping and its `{ baseUrl, paths }` value;
  - the four Next wrappers' lockfile records (version, own patch, `patchedDependencies`, integrity), read with a YAML parser (`lockfile.mjs`);
  - no query, fragment, backslash or `node_modules` segment in a relative or `@/` request, except the two reviewed `?raw` edges;
  - no request form other than relative, `@/`, workspace or a bare package name;
  - no non-literal module request (`import()`, `require`, `module.require`, a bare `module` value, `createRequire`, `import.meta.<x>`, `new X(…, import.meta.url)`), except eleven reviewed occurrences by file and exact text;
  - no `browser` field in a tracked `package.json`.
- **The configuration-change refusal (owner, narrowed bar, 2026-11-23; `config-changes.mjs`).** Under `--enforcing`, a base→head change of any of these is a scanner error, unless `REVIEWED_CONFIG_CHANGES` admits the resulting state. Only a scanner PR can add an admission, and the list is empty today.
  - Files named `next.config.*`, `.babelrc`, `.babelrc.*`, `babel.config.*`, `tsconfig*.json`, `jsconfig*.json` or `.swcrc`, at any level and under any new name of these kinds. An addition, a removal and an edit all count.
  - A reviewed wrapper's lockfile record, compared between base and head whatever the Next config's state.
  - The advisory run records the same list in `configChanges`. The replay adds `build-config` to a pair's `wouldRefuse`.
- **The cost of both invariants.** Any change of the inputs above needs a scanner PR first. That includes `apps/web/src/next.config.test.ts`, whose name matches the pattern. While the checks are required, the dependent PR cannot merge before that scanner PR does.

## Named residuals, covered by review

These are outside the scanner's listed inputs (Astra round 6; the owner's bar, 2026-11-23). The scanner does not model them. Where noted, the configuration-change refusal catches the change that would introduce one.

1. **Next config discovery above `apps/web`.** A `next.config.*` in `apps/` or the root could change webpack resolution.
   - Noticed: adding or editing it is refused under enforcement (any level). Its effect is reviewed in the scanner PR that would admit it.
2. **Babel configuration.** A Babel plugin could rewrite a request before webpack resolves it.
   - Noticed: adding or editing any Babel config is refused under enforcement. Its plugins are reviewed in the admitting scanner PR.
3. **Package tsconfigs.** The scanner judges every `packages/**` caller with the root tsconfig. A package's own `paths`, used by its own `tsc`, is not modelled.
   - Noticed: any `tsconfig*.json` change is refused under enforcement. The admitting scanner PR reviews whether it changes a resolution.
4. **`jsxImportSource`.** A relative JSX runtime source creates a request that no source line shows.
   - Noticed: it is a tsconfig change (refused under enforcement), or a pragma comment in a source file, which review sees in the diff.
5. **Reviewed dynamic requests.** The eleven reviewed occurrences are pinned by their text. A later use, in the same file, of what they bind (the service-worker module constants in `apps/web/src/features/help-now/sw-test-utils.ts`, `requireFromHere` in `packages/database/src/migration-callback-source-verifier.ts`) is not followed.
   - Noticed: by review of any diff to those files, which are the only files where the exception applies.
6. **The wrappers' own dependencies.** The wrapper's record is pinned, but a dependency of a wrapper can change version under it.
   - Noticed: by review of the lockfile diff, in the dependency PR that changes it.
7. **A `browser` field under a tracked `.turbo` or `.next` directory.** These directories are not walked.
   - Today no such directory is tracked (`git ls-files`, 2026-11-23).
   - Noticed: a tracked `.turbo/` or `.next/` path shows in the PR's file list, and review refuses it.

Also named limits: Turbopack (`next dev`) is not modelled; a later Next that aliases a relative or `@/` key is caught only through the extension-list oracle test.

## Tests to run

- `node --test scripts/ci/screen-contract-check*.test.mjs` (the whole module).
- Configuration refusal: `scripts/ci/screen-contract-check.config-changes.test.mjs`.
- Fixed configuration and request forms: `scripts/ci/screen-contract-check.resolution.test.mjs`.
- Replay judgment: `scripts/ci/screen-contract-check.replay-judgment.test.mjs`.

## What not to reach into

- Never weaken a pin or a refusal to let a PR pass. A configuration change goes through a scanner PR that reviews it and updates the pin or `REVIEWED_CONFIG_CHANGES`.
- The scanner never runs the scanned code and never reads the head's scanner: the trusted base supplies the scanner, its settings and these data files.
