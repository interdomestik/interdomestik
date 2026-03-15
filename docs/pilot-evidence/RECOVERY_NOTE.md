Pilot evidence policy (2026-02-21):

- This repository tracks only the canonical index.csv (day runs + artifact paths) for continuity.
- As of R01, `docs/pilot-evidence/index.csv` uses canonical stable references to the release report and copied pilot evidence index; `legacy_log_path` preserves pre-R01 local-log continuity only.
- Report snapshots are committed under docs/release-gates/ (for stable reference).
- Full logs are retained locally under tmp/pilot-evidence/ and are intentionally not committed.
- Earlier pilot artifacts may be missing due to local repo deletion/restore; this note marks the canonical reset point.
