# Frontend and backend optimization implementation plan

> Execute the approved code-review recommendations on `codex/frontend-backend-optimization`. Use parallel workers with disjoint file ownership and regression tests before integration.

**Goal:** Protect private mail and sessions, remove redundant full-list downloads, and make mail operations recoverable and consistent.

**Architecture:** Keep Vue/Pinia and Hono/D1/KV/R2. Add authorized single-message detail endpoints, short-lived attachment capabilities, bounded session-scoped detail caches, and durable mail-operation state. Preserve existing list endpoints for API compatibility. No deployment or main-branch merge is part of this task.

**Constraints:** PowerShell, UTF-8. Existing 44 Worker unit tests are the baseline. The old `test` script deploys and must not be used until renamed. All cloud data used during verification is mocked/local.

## 1. Download and session boundary (controller)
- [x] Regress unauthenticated KV configuration reads and incorrect multi-device logout.
- [x] Restrict public object keys to static backgrounds; private attachment downloads require a signed, expiring key capability. Normalize storage responses and missing objects.
- [x] Authorize detail reads by ownership, with a distinct permission-protected administrator endpoint. Return signed attachment URLs and signed inline-image URLs without changing stored keys.
- [x] Fix logout awaiting, missing-session handling, and TTL preservation.

## 2. Frontend mail data lifecycle (frontend worker)
- [x] Replace dual full/brief list calls with one brief call and `ensureDetail(emailId, { admin })` on open/reply/forward.
- [x] Limit detail caching and deduplicate requests; isolate by session and reset on logout/identity changes.
- [x] Protect list refreshes and detail mutations against stale responses; cancel polling/listeners on deactivation/unmount.
- [x] Provide bootstrap/detail loading, failure and retry states. Verify race, cache, forwarding, and initialization regressions.

## 3. Safe HTML display (HTML worker)
- [x] Regress event handlers, active embedded content, unsafe URLs and remote tracking resources.
- [x] Sanitize email HTML and CSS with a maintained sanitizer, retaining ordinary email layout and safe local signed images. Remote images require explicit display consent.
- [x] Reobserve new content and container changes to keep sizing correct. Add browser-DOM unit coverage.

## 4. Mail processing consistency (backend worker)
- [x] Validate attachments before any provider call; persist an idempotent send operation before dispatch.
- [x] Atomically reserve quota and increment daily counters; keep ambiguous provider results from automatic duplicate sends.
- [x] Preserve recoverable receive state on attachment failure; retry safely without duplicate delivered mail.
- [x] Delete fixed, bounded ID batches with consistent email/star/attachment references and retryable object cleanup.
- [x] Add explicit, repeatable migrations for new operation state and tests for failure/concurrency paths.

## 5. Integration and delivery (controller)
- [x] Add frontend test harness and CI unit-test gates; rename deployment-only test script.
- [x] Run frontend tests, Worker tests, production build and local Worker bundle validation.
- [x] Review the complete diff independently; resolve security/correctness findings and verify the fixes.
- [x] Record actual test counts, build measurements, and remaining deployment requirements. Leave changes on the new branch.
