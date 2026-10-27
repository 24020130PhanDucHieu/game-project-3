# PostgreSQL egress: tournament polling

## Confirmed cause (2026-10-27)

`StartRoundTransitions` used to call `GetAll()` every second. The PostgreSQL
implementation returned every tournament's full JSON, including sources and
match history, even with no connected browsers and no active matches.

Read-only production measurements:

- 6 tournaments, totaling 1,064,320 bytes of JSON.
- 773,021 executions of `SELECT id, data FROM tournaments` at the first sample.
- 773,498 executions 478 seconds later: effectively one full scan per second.
- At that payload size, the timer alone transfers about 91.96 GB/day of JSON,
  before protocol overhead. This is an estimate from the current data size,
  not a reconstruction of the entire billing period.

## Fix

- The transition timer selects only tournament/match IDs whose intermission
  deadlines are due. No source or replay JSON crosses the connection for this
  check. Its one-second cadence and transition rules are preserved.
- General tournament reads validate each cached row against PostgreSQL using
  `xmin` plus `updated_at`. SQL returns `NULL` instead of unchanged JSON. A
  changed/new row is fetched in full. There is no TTL hiding external updates.
- Read refreshes are serialized to reuse the cache during concurrent polling.
  Save/delete invalidates versions, and a generation guard prevents an older
  in-flight read from replacing the cache after a write.
- Single-record database failures remain errors rather than stale successful
  reads. The existing all-record read-only fallback remains available.
- Summary lists use the existing SQL projection rather than `GetAll()`.

The revision projection was verified against production PostgreSQL in a read-only
transaction: 278 bytes of IDs/revisions for six unchanged rows and **0 bytes of
JSON payload**. The idle transition query returned no due matches.

The backend-only patch was applied to AWS at approximately 14:58 UTC on
2026-10-27 after confirming no running matches/jobs. The previous backend binary
was backed up. Health/readiness and repeated public list/detail reads passed.
The old full-scan counter was 773,767 before the restart and remained 773,767 at
15:00:45 and 15:01:05 UTC. The projected timer continued running and returned zero
rows while idle. This verifies that the old full-payload loop stopped; it is not
a measurement of all remaining Supabase traffic or a billing adjustment.

## Verification and monitoring

Run from `backend`:

```sh
go test ./internal/repository ./internal/service ./internal/handler/http ./internal/qualifier ./internal/adapter ./internal/auth ./internal/middleware ./internal/observability
go build ./cmd/server
go build -o egress-audit ./cmd/egress-audit
```

The tests cover unchanged-read transfer, external changes, defensive copies,
database failures, deletion, concurrent save/read ordering, projected scheduler
reads and local deadline selection.

`egress-audit` reads the usual database environment variables. On the Linux
gateway, `egress-audit -pid <gateway-pid>` can read the running process environment
with the appropriate OS permissions. It runs read-only queries and reports only
aggregate sizes, query IDs/counts and activity counts. It does not print database
credentials, user records, sources or statement text. Query statistics may be
unavailable if the database role cannot read `pg_stat_statements`.

Compare two audit samples after deployment. The `tournament_full_scan` query's
count must stop increasing; the projected transition query may continue once
per second. Check Supabase's subsequent **daily/hourly growth**, not whether the
already accumulated usage total goes down. Remaining traffic still includes
changed tournament snapshots, other records and connection/protocol traffic.

See [Supabase egress usage](https://supabase.com/docs/guides/platform/manage-your-usage/egress)
for the dashboard's egress categories and reporting behavior.
