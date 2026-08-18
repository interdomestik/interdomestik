# T-115 OD17 Terminal Provider-Failure Evidence

## Disposition

The attempt is terminally classified as
`provider_failure / measurement_capability_missing`. No performance PASS or
metric is claimed. [PR #1593](https://github.com/interdomestik/interdomestik/pull/1593)
was closed unmerged at exact head
`a5c5534da28cb37553daad5d696523baeba5da49`.

## Preserved Evidence

- Exact-head E2E run
  [`32166438771`](https://github.com/interdomestik/interdomestik/actions/runs/32166438771),
  attempt 1: success; full runner `95807306189` completed in 16 minutes 38 seconds.
- Exact-head preparation run
  [`32166438756`](https://github.com/interdomestik/interdomestik/actions/runs/32166438756),
  attempt 2: success in 5 minutes 22 seconds. Attempt 1 was invalidated only by
  an Ubuntu package-mirror failure while obtaining `rg`.
- Sonar Quality Gate: pass with zero new issues and zero security hotspots.
- CodeQL and open code-scanning alerts: pass / zero open alerts.
- Security, final exact-head reviewer intake and all seven review threads: pass / resolved.
- Automatic Vercel Preview deployment
  [`dpl_Cu1Doy9Y6iswiwCzEMySSe9kaFQY`](https://vercel.com/ecohub/interdomestik-web/Cu1Doy9Y6iswiwCzEMySSe9kaFQY)
  compiled in 2.8 minutes, stalled at `Running TypeScript`, and failed at the
  provider's 45-minute build maximum. The canary was never dispatched.

## Recovery Boundary

The exact unmerged head is preserved by a verified Git bundle at task-artifact
identity `od17-pr1593-a5c5534d.bundle`: 21,553 bytes, SHA-256
`5339bce12d57345f618bc83befe23fee1c6796c804f3f2e789bb36e2cbd78bd8`.
It requires base `a889f84aa9453f06d8ce51d8c865680d84124f55`.

OD#17 remains the first eligible residual. A fresh authority decision is required
before another implementation or provider attempt. `T-118` and `T-117` remain
blocked until OD#17 has an actual PASS, merge and closeout.
