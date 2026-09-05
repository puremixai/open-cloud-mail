# Backend mail reliability handoff

Implemented task 4 on the shared `codex/frontend-backend-optimization` branch. No commit, branch switch, deployment, network verification, or package changes by the backend worker.

## Integration

- Frontend sends `params.requestId`, preserving it for unchanged-message retries. `Idempotency-Key` is also accepted. Legacy callers omitting both receive a server-generated UUID; duplicate prevention across requests requires callers to reuse a key.
- Successful retries of accepted operations return the existing `[emailRow]`. A changed payload under an existing key is rejected with 409. Accepted operation records survive local email deletion so the key cannot dispatch again.
- Error 424 explicitly means the operation definitely did not send: local staging/quota failure, definite provider rejection, or replay of an already failed operation. Frontend may rotate its key after 424. Pre-operation validation/authorization may return 400/403. Preserve the key on network errors, 500 and 409; uncertain operations must not be resent automatically.
- `emailService.emailAddAtt(c, [row])` remains unchanged.
- `list` and `allList` accept `includeTotal: 0` or `'0'`, skip the count query and return `total: null`; omission preserves the existing count behavior.
- `analysisService.queryEcharts` now uses `analysisDao.daySendCount(c)` backed by D1. Existing historical chart queries are unchanged; new durable daily counters start with the new flow, without importing historical KV statistics.

Controller scheduler wiring, before either cron branch:

```js
import { recoverMailOperations } from './service/mail-operation-service';

await recoverMailOperations({ env });
```

The old `completeReceiveAll` entry point is a compatibility no-op. Recovery processes at most 50 due object deletions and 10 pending receives per invocation. Object failures retain their keys, errors and exponential retry times. Receive failures retain raw data, payload, error and timestamps. A normal error releases the receive lease immediately; an interrupted worker's lease expires after 20 minutes. Pending receives must be at least one minute old for scheduled recovery.

## Migration

Run the controller's `mail-worker/scripts/migrate-mail-operations.mjs` predeployment migration against an existing database **before enabling new send/receive/scheduler code**. The workflow now performs this preflight before activation. Both that CLI and `migrateMailOperations({ env })` share the pure SQL builder in `mail-worker/src/migrations/mail-operations.mjs`. `dbInit.init` invokes the runtime migration after `v3_4DB` for the installer path; no migration failures are swallowed. New empty databases still use the installer. The new code intentionally requires the migrated schema.

`mail_schema_version` version 1 guards a repeatable D1 transaction which creates:

- `mail_operation`: user-scoped send keys, request fingerprints, preparation/dispatch/acceptance/failure states; receive identity, archive pointer and lease.
- `mail_daily_count`: atomic UTC send-recipient and receive counters.
- `mail_object_cleanup`: durable object deletion retry queue.
- `attachments.operation_slot`, unique `(email_id, operation_slot)`, plus `attachments(key)` index.
- `user.send_count_day`, stamped to the current UTC date for existing users so migration preserves already consumed quota. Reservations and daily reset use the same UTC boundary.
- Recovery and cleanup due-time indexes.

The version row is written only in the successful migration batch. Existing attachment rows retain nullable slots and are not deduplicated or discarded. Retain the new tables/columns if rolling application code back; do not delete idempotency evidence.

## Storage keys

- Send attachments: `attachments/<UUID>/<numericSlot>`.
- Receive attachments: `attachments/receive-<64-lowercase-hex-SHA256>/<numericSlot>`.
- Raw receive archive: `mail-raw/<64-lowercase-hex-SHA256>.eml`. This namespace must remain private and must not be accepted by public/static or attachment capability validators.

Attachment slots are stable and references are inserted before upload. Retry overwrites the same object and does not create duplicate attachment rows. Owned signed `/api/oss/attachments/...?...` inline-image URLs are converted to CID bytes before forwarding; missing/unowned objects fail before send. Each new send owns distinct keys, avoiding races with deletion of an earlier message. Shared existing objects are retained while any attachment reference exists.

## Recovery boundaries

- Provider timeouts, unknown failures, missing acceptance IDs and a failed post-provider local commit retain the reservation and block duplicate dispatch. `dispatching` and `uncertain` sends require operator/provider reconciliation; the scheduler never resends them. A crashed send still in `preparing` also requires operator review; no automatic send retry was added.
- Completion of a receive commits email visibility, operation state and its daily count together, then queues raw archive cleanup and removes the redundant payload from the operation. Scheduled recovery restores local mail only; it does not replay Telegram notifications or external forwarding.
- A failure to archive the original bytes is rethrown to the delivery runtime. Such records retain an error, but recovery needs a retry of the original delivery if the archive never reached storage.
- Existing legacy SAVING rows without a raw archive/operation remain incomplete for operator investigation; cron no longer guesses that they are complete.
- Bulk mail cleanup skips SAVING rows. Explicit deletion of a SAVING mail or an account/user with SAVING mail returns 409, preserving data needed for recovery. Account/user deletion also checks pending receive payload ownership using `json_extract`: archival may have succeeded before email insertion, leaving no SAVING row yet. Initial pending-receive guard failures preserve stars; a late conflict can occur after earlier cleanup steps have committed. Fixed deletion batches contain at most 80 IDs, and email, star, attachment-reference deletion plus cleanup enqueue happen in one transaction.
- Account/user deletion and receive claims now coordinate at the actual D1 writes. Receive `INSERT ... SELECT` requires the account and matching user to exist; `(accountId,userId)=(0,0)` remains allowed for NOONE. The final physical DELETE uses atomic `NOT EXISTS` predicates against pending receive payloads and all remaining mail, including a receipt which completed after the initial cleanup; final user deletion also requires no remaining accounts. A competing receipt preserves its owner and causes deletion to return 409. If deletion commits first, the stale receive claim returns 503 before creating an operation or raw archive, so a retried delivery can look up its recipient again. Lease acquisition also checks ownership to prevent historical orphan operations from being recovered into delivered mail.
- Internal recipients commit their email and attachment references together, one recipient per transaction. A failure partway through a multi-recipient internal send is retained as uncertain and is not replayed.

## Verification

`mail-worker/test/mail-reliability.spec.js`: 37 targeted tests using actual SQLite SQL and synchronous transactional D1 batches in `test/helpers/local-d1.js`. The initial six regressions failed against the old implementation. Coverage includes provider-before-validation, persisted-before-provider ordering, concurrent quota and idempotency, uncertain acceptance, safe 424 retry, migration repeat/failure and legacy quota preservation, MIME/UTF-8 recovery, concurrent receive leasing, internal attachment rollback, fixed deletion sets, durable cleanup and optional count queries. Atomic ownership regressions inject both pending and completed receipts after initial deletion guards, cover account and user deletion winning before a stale receive claim, and retain NOONE compatibility.

Post-integration fixes add 13 tests in `test/content-disposition.spec.js` and two in `test/s3-cleanup.spec.js`. `src/utils/content-disposition.js` builds an ASCII fallback plus RFC 5987 UTF-8 filename and normalizes historical raw metadata before constructing Headers/Response. It is used by new/legacy attachment writers and KV/S3/R2 download paths; Chinese names, quotes, escaped quoted names, CRLF and existing UTF-8 filename* are covered. Forced attachment responses preserve the filename. S3 HTTP 200 `DeleteObjects` responses containing `Errors` now throw, preserving durable cleanup records until a subsequent successful deletion.

Run locally from `mail-worker`:

```powershell
node node_modules/vitest/vitest.mjs run --config vitest.unit.config.js
```

All verification uses local SQLite and mocked storage/providers. Controller owns production build, Worker bundle validation, scheduler integration and rollout.
