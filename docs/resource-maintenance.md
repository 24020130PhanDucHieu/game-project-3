# Resource maintenance

EC2 hosts use two concurrent judging requests per worker, four in total.
The gateway uses WORKER_CONCURRENCY=2 and JUDGE_CONCURRENCY=4; qualifier and
validation pools each use four workers, subject to the shared judging cap.
This follows the one-versus-two concurrency benchmark; extra work waits in the existing queue.
The admission limiter continues returning 429 for a busy worker.

The Go API uses `GOMEMLIMIT=128MiB` (soft GC target), with systemd's existing
192 MiB hard limit. Derived responses have a 128-key cap and release references
on expiry/invalidation. PostgreSQL's pool remains capped at eight connections,
two idle, with a one-minute idle timeout. In-use advisory-lock sessions are unaffected.

`arena-database-maintenance.timer` runs every six hours, with up to 15 minutes
jitter. Each run deletes at most 500 rows from each of two tables:

- Password reset tokens expired for more than one day.
- AI answer cache older than two days (application validity is 24 hours).
- Admin OTPs expired for more than one day.
- AI daily quota/token counters older than 30 days in Vietnam time.

Malformed timestamps are preserved. Submissions, jobs, replay, receipts, settings,
accounts, tournaments and all audit/chat logs are preserved. The maintenance
transaction uses an advisory lock, one-second lock timeout, five-second statement
timeout and `SKIP LOCKED`. Errors roll back the whole batch. PostgreSQL autovacuum
reuses dead-row space; no `VACUUM FULL` is scheduled.

Preview with the database environment loaded securely:

```
python3 scripts/database_maintenance.py
python3 scripts/postgres_backup_restore_drill.py --cleanup --directory /var/backups/arena --keep-count 7 --dry-run
```

Backup retention runs daily after the scheduled backup. It accepts both generated
timestamp naming formats and verifies SHA-256 for all seven retained backups
before deleting older scheduled backups. Manual/migration archives, partial files
and symlinks are excluded. If verification fails, nothing is deleted.

Disabling the two maintenance timers stops future cleanup; it does not restore
deleted disposable records. Restore data only from a verified backup when needed.
No fixed load capacity is promised: a concurrency cap prevents runaway judging,
but queue latency grows if sustained incoming work exceeds processing capacity.

## Verification on 2026-10-28

- Go HTTP/repository/adapter/qualifier tests passed, including stale cache
  invalidation and bounded key retention.
- Backup tests covered both naming formats, dry run, corrupt/missing checksums
  and preserving manual/migration archives. Worker admission/recovery test passed.
- Actual PostgreSQL TEMP-table fixtures verified expiry predicates, preservation
  of business records and the 500-row limit; all fixture changes rolled back.
- Initial rollout used one slot per worker. Subsequently verified and applied
  two slots per worker, total four, including the running gateway configuration.
  API `GOMEMLIMIT=128MiB` remains unchanged.
- First cleanup removed three expired reset tokens and two disposable records.
  Counts remained 73 accounts, six tournaments, 107 submissions and 125 jobs.
- Seven scheduled backups retained; pre-migration archive preserved. A fresh
  backup completed successfully before cleanup. Both maintenance timers active.
- Real sandbox validation succeeded on each worker. Forty read-only HTTPS
  requests with four concurrent clients from the gateway all returned 200;
  p95 77 ms, max 99 ms. This is a small smoke test, not a capacity benchmark.
