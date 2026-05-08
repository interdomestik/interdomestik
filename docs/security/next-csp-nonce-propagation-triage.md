# P33-SEC05 Next CSP Nonce Propagation Triage

Status: completed evidence slice
Date: 2026-05-08
Branch: `codex/p33-sec05-next-csp-nonce-triage`

## Classification

SEC05 classifies the SEC03 blocker as a report-only architecture mismatch with the
documented Next.js nonce model.

It is not an upstream Next.js nonce propagation bug in the installed version, because the
documented baseline works in a minimal App Router app on Next `16.2.4`: a nonce-bearing
`Content-Security-Policy` request header plus matching response header causes Next to add
the nonce to framework scripts, page bundles, and inline runtime scripts.

It is also not an Interdomestik product wiring gap by itself, because the same minimal app
reproduces the failing SEC03 shape when a non-nonce enforced `Content-Security-Policy`
response header is present beside a nonce-bearing `Content-Security-Policy-Report-Only`
header. In that shape, Next leaves first-party framework and runtime scripts unnonced even
when `x-nonce` is present and the cloned request headers include the nonce CSP.

## Evidence Command

Reproduce with:

```bash
node scripts/security/next-csp-nonce-triage.mjs
```

The script creates a temporary minimal Next app under
`tmp/sec05-next-csp-nonce-triage/app`, builds it with the installed Next `16.2.4`, runs the
four DG06 matrix cases, and writes raw headers plus HTML under
`tmp/sec05-next-csp-nonce-triage/artifacts`.

The temporary app is not product runtime. It has one dynamic App Router page, one client
component to force page bundle scripts, a root-layout `data-csp-nonce-probe`, and a generated
`proxy.ts` that follows the documented ordering:

1. clone request headers,
2. set the case-specific request headers,
3. call `NextResponse.next({ request: { headers } })`,
4. set the case-specific response headers.

## Matrix Results

All cases used the same nonce value and nonce-bearing script directive:

```text
script-src 'self' 'nonce-c2VjMDUtY29uc3RhbnQtbm9uY2U=' 'strict-dynamic'
```

| Case | Header shape                                                                                                                                                       | Raw HTML result                                   | Browser result                                                                                                                   | Decision                                                                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A    | Request nonce `Content-Security-Policy`; response same nonce `Content-Security-Policy`; `x-nonce` present                                                          | `10/10` first-party scripts carried the nonce     | `11/11` DOM scripts carried the nonce; zero script-family violations                                                             | Documented baseline passes; not an upstream Next nonce bug.                                                                                              |
| B    | Request nonce `Content-Security-Policy`; response non-nonce enforced `Content-Security-Policy` plus nonce `Content-Security-Policy-Report-Only`; `x-nonce` present | `0/10` first-party scripts carried the nonce      | `0/10` DOM scripts carried the nonce; first-party `script-src-elem` reports for `_next/static/*` and inline scripts              | Reproduces SEC03 blocker in a minimal app; current report-mode architecture is incompatible with Next nonce propagation.                                 |
| C    | Request nonce `Content-Security-Policy-Report-Only`; response nonce `Content-Security-Policy-Report-Only`; `x-nonce` present                                       | `10/10` first-party scripts carried the nonce     | `11/11` DOM scripts carried the nonce; zero script-family violations                                                             | Report-Only-only can work when no enforced CSP header competes with it.                                                                                  |
| D    | No request nonce CSP; no `x-nonce`; response nonce `Content-Security-Policy-Report-Only` only                                                                      | `10/10` raw first-party scripts carried the nonce | Framework/runtime scripts carried the nonce; the app-owned `next/script` canary script had no nonce because `x-nonce` was absent | The initial negative-control expectation was wrong: Next can derive framework nonces from a Report-Only response when no enforced CSP header is present. |

Representative Case B raw script:

```html
<script src="/_next/static/chunks/bbe5f5b4-bf6b688109bbdfa5.js" async=""></script>
```

Representative Case A raw script:

```html
<script
  src="/_next/static/chunks/bbe5f5b4-bf6b688109bbdfa5.js"
  async=""
  nonce="c2VjMDUtY29uc3RhbnQtbm9uY2U="
></script>
```

## Installed Source Inspection

Installed Next source contains the relevant precedence path in the App Router request-header
parser: it reads `headers['content-security-policy'] || headers['content-security-policy-report-only']`
before extracting the nonce with `getScriptNonceFromHeader`.

That explains the matrix:

- if `Content-Security-Policy` is present and contains the nonce, framework scripts are
  nonced;
- if only `Content-Security-Policy-Report-Only` is present and contains the nonce, framework
  scripts are nonced;
- if `Content-Security-Policy` is present without the nonce, Next does not fall through to a
  nonce-bearing Report-Only header.

## SEC03 Impact

SEC03 should not be reopened as a first-party script nonce fix under the current Phase 0
report-mode architecture if the enforced CSP header must remain unchanged. The observed
failure is structural to the current two-header model:

```text
Content-Security-Policy: existing non-nonce enforced policy
Content-Security-Policy-Report-Only: nonce policy with 'strict-dynamic'
```

With that shape, Next sees the enforced CSP first and has no nonce to propagate to framework
scripts. The SEC03 evidence counts on the product app (`72` unnonced scripts and `84`
first-party script-family reports on landing) match the minimal Case B behavior.

## Recommendation

Keep CSP Phase 1 enforcement blocked.

Do not attempt to HTML-rewrite framework output, monkey-patch Next internals, weaken
Report-Only CSP, remove `'strict-dynamic'`, or narrow first-party CSP report classification
to hide the reports.

The next safe decision is a design gate, not an implementation retry:

- either accept that Phase 0 report-only cannot prove a nonce policy while preserving the
  current enforced CSP header unchanged,
- or design a new migration architecture that allows Next to see a nonce-bearing effective
  `Content-Security-Policy` without prematurely promoting Phase 1 enforcement.

Any future implementation must explicitly state how it preserves the current enforced CSP
behavior or why the migration bar has changed.
