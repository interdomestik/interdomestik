---
applyTo: 'apps/web/src/messages/**/*.json'
---

# i18n quality instructions

Message catalog changes should preserve locale quality and keep review diffs easy to reason about.

- Keep locale orthography, diacritics, and register consistent with sibling files in the same locale.
- Reuse established product glossary instead of introducing parallel spellings. For Serbian Latin, preserve forms such as `članstvo`, `Podrška`, `upućivanje`, `početni`, and `sledeći`.
- Prefer surgical edits to the touched namespace or keys. Avoid broad full-file rewrites unless the structure actually changes.
- When reviewing message changes, prioritize meaning regressions, over-promising copy, missing disclaimer language, and glossary drift over descriptive summaries.
- If a copy change tightens a contract or disclaimer, update or verify the nearest focused test or deterministic validation in the same change.
