# Historical Secret Scan triage — 2026-09-28

The [scheduled Secret Scan run 36425318812](https://github.com/interdomestik/interdomestik/actions/runs/36425318812) scanned 2,931 commits at `5a6c91681149edf74b0ee0e3d6337797fdb34c28` and reported 976 Gitleaks findings. This is a count of historical detections, not a count of active credentials. The run's redacted SARIF was reviewed without copying credential values into this document or the ignore file.

| Findings | Disposition                                                                                                                                                  |
| -------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|      956 | Sonar issue/rule identifiers in historical JSON exports. These are scanner object keys, not credentials.                                                     |
|        5 | Signed upload URLs in a February 11 release-gate receipt. The embedded JWT expiry times are February 11, 2026.                                               |
|        2 | Documented local Supabase development JWT fixtures in `scripts/security-setup.sh`, bound to the local development setup.                                     |
|        4 | Guarded Stripe placeholder strings in historical QA code. The code rejects the placeholder when no environment key is set.                                   |
|        6 | Nonsecret project/scanner metadata, generated Storybook code, a `curl` availability check, and a fixed golden tracking UUID.                                 |
|    **3** | **Three distinct, real-format Sonar project tokens were committed in January 2026. Their revocation is not yet proven. They remain unignored and blocking.** |

The 973 reviewed nonactive detections are ignored by **exact commit/path/rule/line fingerprint** in `.gitleaksignore`. There is no path-wide or rule-wide suppression. A new finding at another fingerprint remains blocking. The current `sonar-project.properties` has no `sonar.token` property. GitHub's `SONAR_TOKEN` secret was updated on March 11, 2026, but that metadata does not prove that all three older tokens were revoked in SonarCloud.

Before the remaining three findings can be closed, confirm in SonarCloud that all three historical project tokens are revoked; revoke any that remain active and verify that the current CI token still works. Record only token identifiers or sanitized fingerprints, never token values. Then add only those three exact historical fingerprints to `.gitleaksignore` and rerun the full-history scan. Do not rewrite Git history as a substitute for revocation. [GitHub's guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) prioritizes revoking or rotating exposed credentials and explains the costs of history rewriting. [Gitleaks documents](https://github.com/gitleaks/gitleaks/blob/master/README.md) exact ignore/baseline mechanisms.

Verification with Gitleaks 8.30.0: the same `--all` redacted history scan now reports only the three `sonar-api-token` findings and exits 1; a newly generated synthetic Sonar-format token also exits 1. This is deliberately an **open security finding**, not a green-scan or complete pilot-readiness claim.
