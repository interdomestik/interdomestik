# Subscription reviewer communication

Use `pnpm review:sonnet`, `pnpm review:gemini`, and `pnpm review:flash` for a
committed candidate. These commands send the bounded committed diff and repository
review authority to the selected subscription provider. Obtain permission for that
private-code transmission when the execution environment requires it. Dirty edits
are not included. No command authorizes merging or deployment.

For a public-only diagnosis, run:

```sh
node scripts/ci/model-review-access.mjs --reviewers sonnet,gemini,flash --required sonnet,gemini,flash --probe call
```

`--probe command` checks executable presence only. It does not prove authentication,
quota, executable signature, model selection, or review readiness. A call probe uses
the same restricted runner as a review, with a fixed public prompt.

## Execution and evidence

- Sonnet uses the signed native Claude executable at `~/.npm-global/bin/claude`,
  a private executable copy, fresh empty working directory, empty tools/MCP,
  disabled hooks/skills/Chrome, and no persisted session. The minimal environment
  preserves subscription HOME, USER and LOGNAME; it excludes API keys and loader
  overrides. Do not use bare mode, which excludes subscription login.
- Gemini uses the signed, SHA-pinned native Antigravity executable at
  `~/.local/bin/agy`. The `gemini` wrappers are not accepted. Each run checks the
  catalog and runs fresh negative/positive public canary controls before sending
  a private packet. The custom agent is explicitly registered with `--add-dir`.
  An echoed agent name alone is insufficient because missing agents can fall back.
- Pro is pinned to `gemini-3.1-pro-high`; Flash to `gemini-3.8-flash-low`. No
  provider, model, API-key or paid fallback occurs. Init tool inventory is distinct
  from the effective custom-agent allowlist; actual tool events in a review fail.
- Sonnet receipts use `primary-response-model`, with consistent session and
  successful terminal response validation. All aggregate usage remains recorded,
  including auxiliary models. Aggregate usage does not identify the primary model.
- Gemini receipts retain `providerReportedModel: null` and explicitly use
  `native-selection-inference`. Catalog, native selection logs and successful
  usage are operational evidence, not independent server attestation.

JSON and Markdown review receipts are under `tmp/reviewer-routes`. Public diagnostics
print their receipt path. Native subprocess records, control logs and executable
identity are retained in the task's temporary evidence directory referenced by the
receipt. Preserve these artifacts when cleaning a worktree; they can contain private
review responses and must not be published indiscriminately.

## Diagnosis

Check `status`, `blockerReason`, `error`, `failedStage`, timeouts, and raw subprocess
records. A failed or blocked receipt is never a review approval. `ran` plus
`VERDICT: FINDINGS` means transport succeeded and findings require disposition.

- Missing CLI: install/configure the official subscription CLI at the documented
  native location. Do not substitute a wrapper that fabricates model fields.
- Signature/hash rejection: verify the publisher and intentionally revalidate an
  updated native build, catalog, stream/log contract and both capability controls
  before updating the pin. Never accept a changed hash merely to clear an error.
- Login failure: verify the existing subscription login with the provider's normal
  login flow and check the non-secret user environment. Never export credentials.
- Quota or unsupported client: preserve the exact error and park that provider
  until quota resets or support/version changes. Official Gemini CLI 0.56.0 was
  observed returning `UNSUPPORTED_CLIENT`; unchanged retries do not restore it.
- Upstream failure: retain the receipt and retry only when there is reason to
  expect recovery. This repair cannot prevent provider outages.
- Parse/model/control rejection: inspect the captured native events and logs;
  repair the versioned contract with focused negative regressions. Do not relabel
  inference as attestation or disable the rejection.

Routes have bounded first-output/total deadlines and own separate process groups.
Cancellation stops their descendants. Cleanup failures remain visible as blockers.
Host and same-user processes remain trusted; this is not a hostile-host sandbox.
