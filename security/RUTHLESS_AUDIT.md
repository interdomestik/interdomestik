# Ruthless Security Audit Report

**Date:** 2026-01-03
**Auditor:** Antigravity (Agent)
**Scope:** Production Critical Failures & Abuse Vectors

## 🚨 Critical Vulnerabilities (P0)

### 1. Arbitrary File Upload & Stored XSS (Remote Shell Risk)

- **Location:** `apps/web/src/actions/uploads/upload.ts` (Lines 64-65)
- **The Code:**
  ```typescript
  const ext = file.type.split('/')[1] || 'webm';
  const fileName = `.../voice-notes/${crypto.randomUUID()}.${ext}`;
  // ...
  await supabase.storage.from(bucketName).upload(fileName, buffer, { contentType: file.type... });
  ```
- **How it Breaks:**
  An attacker sends a request with `file.type = "audio/html"`.
  1. The code extracts `html` as the extension (`ext`).
  2. The file is saved as `uuid.html`.
  3. The `contentType` is set to `audio/html` (or attacker could try `text/html` if client-side validation is bypassed, although line 33 checks `startsWith('audio/')`).
  4. **Bypass:** `audio/html` is a valid string that passes the check but results in `.html` extension. If the storage bucket serves this with `Content-Disposition: inline` (default for many), opening the link executes the HTML/JS in the victim's browser (XSS).
- **Minimal Fix:**
  Enforce a strict strict allowlist of extensions.
  ```typescript
  const ALLOWED_MIME_TYPES: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/mp4': 'mp4',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
  };
  const ext = ALLOWED_MIME_TYPES[file.type];
  if (!ext) return { success: false, error: 'Unsupported file type' };
  ```
- **Test:**
  `curl -X POST -F "file=@malicious.html;type=audio/html" ...` -> Should be rejected.

### 2. Recursive Crash via JSON.parse (Denial of Service)

- **Location:** `apps/web/src/hooks/use-local-storage.ts` (Line 14)
- **The Code:** `return item ? JSON.parse(item) : initialValue;`
- **How it Breaks:**
  If `localStorage` contains invalid JSON (e.g., manually edited by user, or corrupted), `JSON.parse` throws an error. Since this is inside `useState` initialization or logic called during render, it **crashes the entire React component tree**, causing a "White Screen of Death" for that user. They cannot recover without clearing site data.
- **Minimal Fix:**
  Wrap in `try/catch`.
  ```typescript
  try {
    return item ? JSON.parse(item) : initialValue;
  } catch {
    return initialValue;
  }
  ```
- **Test:** Open DevTools, set `localStorage.setItem('key', '{invalid')`, reload page. App should not crash.

---

## ⚠️ Major Issues (P1)

### 3. Voice Recorder Feature Broken by Security Policy

- **Location:** `apps/web/src/proxy.ts` (Line 98) vs `apps/web/src/hooks/use-voice-recorder.ts`
- **The Code:** `Permissions-Policy: camera=(), microphone=(), ...`
- **How it Breaks:**
  The `VoiceRecorder` component attempts to ask for Microphone access, but the browser blocks it immediately due to the HTTP Header policy. Users cannot record claims.
- **Minimal Fix:**
  Allow self-origin for microphone.
  ```typescript
  // proxy.ts
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
  ```
- **Test:** Navigate to Claim Wizard, click "Record", accept permission. It should work.

### 4. RLS Disabled on Auth Tables (Data Leak)

- **Location:** `packages/database` / `supabase`
- **Reference:** Confirmed in `SECURITY_AUDIT_REPORT.md`.
- **How it Breaks:**
  External attackers or anonymous users could potentially query the `user` table if they find an open connection or SQL injection point, leaking all user emails.
- **Fix:** Run migration `00008_harden_auth_rls.sql` (already created, needs verifying).

---

## 🔍 Audit Summary

| Risk   | Issue                         | Status        | Action                |
| :----- | :---------------------------- | :------------ | :-------------------- |
| **P0** | **Upload Extension Spoofing** | 🔴 VULNERABLE | **PATCH IMMEDIATELY** |
| **P0** | **JSON.parse Crash**          | 🔴 VULNERABLE | **PATCH IMMEDIATELY** |
| **P1** | **Broken Voice Recorder**     | 🔴 BROKEN     | **PATCH**             |
| **P1** | **RLS Gaps**                  | 🟠 KNOWN      | Verify Migration      |
