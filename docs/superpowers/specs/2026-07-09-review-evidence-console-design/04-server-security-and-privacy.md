# Design Appendix 4: Server, Security, And Privacy

[Back to the canonical design index](../2026-07-09-review-evidence-console-design.md)

### Local Static Server Contract

The server serves the console only; it exposes no API or write route.

- bind to `127.0.0.1` by default;
- accept an optional numeric `PORT` between 1024 and 65535;
- accept only `GET` and `HEAD`; return `405` with `Allow: GET, HEAD` for every other method;
- serve files from the console's fixed `public/` root;
- decode the request path once; return `400` on malformed encoding;
- normalize the path and reject any resolved path outside the fixed root with `403`;
- map `/` to `/index.html`; do not list directories;
- serve only `.html`, `.css`, `.js`, `.mjs`, `.json`, `.png`, `.webp`, and `.woff2` with explicit MIME types;
- return `404` for missing files and `415` for unsupported extensions;
- send plain-text error bodies without reflecting the request path;
- send `Cache-Control: no-store` during local development;
- send `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and `Cross-Origin-Resource-Policy: same-origin`;
- send a CSP equivalent to `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; connect-src 'none'`.

The implementation uses external module and stylesheet files so the CSP needs no inline-script or inline-style exception.

## Security And Privacy

The v1 processes repo-safe evidence only. `Repo-safe` means fixture choices, short operational prose, and repository-relative evidence references. It excludes customer content and private remote locations.

- no network file uploads;
- no external writes;
- no secrets, credentials, tokens, raw customer identifiers, or private URLs;
- no member, claim, payment, medical, or legal documents;
- no use of the existing portal's Vercel credentials or Blob store;
- receipt import may read one local `.json` file through `File.text()`; the browser never transmits that file, and the UI labels this action `Import local receipt` rather than `Upload`;
- the evidence-reference validator applies only to evidence-reference fields and accepts `^(docs|output/review)/[A-Za-z0-9._/-]+(?:#L[1-9][0-9]*)?$` after trimming;
- the evidence-reference validator rejects `..`, repeated `//`, control characters, and values longer than 240 characters before applying the allowlist pattern;
- short answers and reasons allow at most 2,000 characters; requested changes allow at most 1,000 characters;
- structured text responses declare lower per-field limits in the packet definition;
- the free-text guard applies to concrete answers, reasons, requested changes, owner/reviewer display names, and every structured response whose descriptor type is `text` or `textarea`;
- the free-text guard rejects the case-insensitive email pattern `\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b`;
- the free-text guard rejects the case-insensitive URL-scheme pattern `\b(?:https?|ftp|file|data):\/\/`;
- the free-text guard rejects the case-insensitive credential pattern `\b(?:Bearer|Basic|api[_-]?key|access[_-]?token|refresh[_-]?token)\b|\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]+`;
- the free-text guard rejects unbroken 12-to-19 digit sequences with `\b[0-9]{12,19}\b`;
- all user-entered string fields reject control characters in `U+0000–U+0008`, `U+000B`, `U+000C`, `U+000E–U+001F`, and `U+007F`;
- option, boolean, date, and fixed role-matrix responses validate against their descriptors and do not run free-text patterns;
- packet content and user input render through `textContent`; the app never injects input through `innerHTML`;
- JSON export escapes and serializes plain data only;
- `localStorage` copy warns that the device holds the draft;
- the reviewer must confirm `This packet contains repo-safe evidence only` before submission;
- drafts and receipts remain on the device until the reviewer deletes them with the console's local-data controls;
- `Clear local review data` reports the number of drafts and receipts and requires confirmation;
- the completion receipt repeats that it is evidence intake, not runtime authority.

The guard reduces accidental sensitive input but cannot prove prose is safe. The local design proof must carry this limit in its safety copy. Production handling of real legal, privacy, or identity evidence requires private storage, authentication, retention policy, and a separate authority decision.
