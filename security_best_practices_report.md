# Administrator Security Best-Practices Review

## Executive Summary

The administrator frontend already uses lazy-loaded routes, Supabase-authenticated RPCs, role-aware UI guards, and Firebase security headers. This review fixed four issues in the administrator authentication and boarding workflows. No critical or high-severity frontend vulnerability remains in the reviewed scope.

## Fixed Findings

### SEC-001: Dangerous print-document sink

- Rule ID: JS-XSS-002
- Severity: Medium
- Location: `src/utils/boardingRosterExport.ts:267`
- Evidence: The boarding roster PDF previously rendered its generated document with `document.write`.
- Impact: `document.write` is a dangerous HTML parsing sink. The current dynamic roster fields were escaped, but future additions could accidentally create a stored-XSS path in an administrator workflow.
- Fix: The generated, escaped HTML is now loaded through a Blob URL. The print window has no opener, and the Blob URL is revoked after loading.
- Verification: `tests/boardingRosterPrint.test.ts` rejects any return of `document.write`.

### SEC-002: External administrator link accepted any scheme

- Rule ID: JS-URL-001
- Severity: Low
- Location: `src/pages/admin/AdminBoardingPage.tsx:71`
- Evidence: `VITE_BOARDING_ROSTER_GOOGLE_SHEET_URL` was passed directly to `window.open`.
- Impact: A compromised or incorrect deployment value could open an active URL scheme from an administrator page.
- Fix: The URL is parsed and exposed only when its protocol is HTTPS. The new tab continues to use `noopener,noreferrer`.
- Verification: `tests/adminExternalUrlSafety.test.ts`.

### SEC-003: Stale role refresh could overwrite current administrator state

- Rule ID: REACT-AUTHZ-001 defense-in-depth
- Severity: Medium
- Location: `src/components/AdminAuthProvider.tsx:91`
- Evidence: Manual/realtime role refreshes did not participate in the provider's request-revision guard.
- Impact: A slow role refresh could overwrite newer client authorization state after a session or role change. Server authorization remains the primary protection.
- Fix: Role refreshes now use the same request revision guard, and independent role-selection reads start together through `Promise.all`.
- Verification: `tests/adminAuthRevocationSafety.test.ts` and `tests/reactPerformanceBestPractices.test.ts`.

### SEC-004: Role switches trusted a short-lived cached authorization result

- Rule ID: REACT-AUTHZ-002 defense-in-depth
- Severity: Medium
- Location: `src/lib/adminService.ts:309`
- Evidence: Role switches selected from the shared 30-second administrator-role cache.
- Impact: A role revoked on the server could briefly be restored in the client UI if the administrator switched to it before the cache expired. Server RLS/RPC authorization remained the primary protection.
- Fix: Role switches now invalidate the role cache and revalidate owned roles before changing the active client role. Route preloading runs in parallel with this required server check.
- Verification: `tests/adminAuthRevocationSafety.test.ts` and `tests/reactPerformanceBestPractices.test.ts`.

## Existing Controls Verified

- Administrator pages are lazy-loaded in `src/routes/adminRoutes.tsx`.
- Frontend role checks are treated as UI gating; sensitive writes use Supabase RPCs and are covered by server-authorization tests.
- Firebase hosting sets CSP, clickjacking protection, `nosniff`, referrer policy, and permissions policy in `firebase.json:14`.
- No administrator-scoped use of `dangerouslySetInnerHTML`, `eval`, `new Function`, or `postMessage` was found.

## Residual Risk

- Authorization must continue to be enforced by RLS/RPC functions. Client-side route and role checks are not a security boundary.
- The print document still uses an HTML template, so every future dynamic field added to it must pass through `escapeHtml`.
- Firebase CSP permits inline styles. This is currently needed by the application styling approach, but it weakens CSP style protection and should not be extended to inline scripts.
