# Pilot Evidence Index Template (14 Days, Mon–Sun)

Use this table as the single source of truth for daily pilot ops evidence.

- Keep one row per operating day.
- Use absolute or repo-relative bundle paths exactly as generated.
- If no gate bundle was generated that day, set bundle path to `n/a`.

| Day | Date (YYYY-MM-DD) | Owner | Status (`green`/`amber`/`red`) | Evidence Bundle Path | Incidents (count) | Highest Sev (`none`/`sev3`/`sev2`/`sev1`) | Decision (`continue`/`defer`/`hotfix`/`stop`) |
| --- | ----------------- | ----- | ------------------------------ | -------------------- | ----------------- | ----------------------------------------- | --------------------------------------------- |
| 1   |                   |       |                                |                      |                   |                                           |                                               |
| 2   |                   |       |                                |                      |                   |                                           |                                               |
| 3   |                   |       |                                |                      |                   |                                           |                                               |
| 4   |                   |       |                                |                      |                   |                                           |                                               |
| 5   |                   |       |                                |                      |                   |                                           |                                               |
| 6   |                   |       |                                |                      |                   |                                           |                                               |
| 7   |                   |       |                                |                      |                   |                                           |                                               |
| 8   |                   |       |                                |                      |                   |                                           |                                               |
| 9   |                   |       |                                |                      |                   |                                           |                                               |
| 10  |                   |       |                                |                      |                   |                                           |                                               |
| 11  |                   |       |                                |                      |                   |                                           |                                               |
| 12  |                   |       |                                |                      |                   |                                           |                                               |
| 13  |                   |       |                                |                      |                   |                                           |                                               |
| 14  |                   |       |                                |                      |                   |                                           |                                               |

## Bundle Path Convention

- Weekend safety check only:
  - set bundle path to `n/a` and reference ticket/incident log if any.
- Full gate bundle run (`./phase-5-1.sh`):
  - `tmp/pilot-evidence/phase-5.1/<YYYY-MM-DDTHH-MM-SS+ZZZZ>/`
