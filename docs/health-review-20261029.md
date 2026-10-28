# Backend and database review — 2026-10-29

Read-only checks against the two running AWS EC2 hosts:

| Metric | Gateway / worker 1 | Worker 2 |
| --- | --- | --- |
| Public IP | 13.250.49.111 | 13.212.114.254 |
| Service state | active | active |
| Automatic service restarts | 0 | 0 |
| Available host RAM | 415 MiB | 458 MiB |
| Root disk used | 71% | 67% |
| Worker health | HEALTHY | HEALTHY |

The gateway readiness endpoint returned HTTP 200 with database and workers ready.
Its running configuration uses two slots per worker and four shared judging slots.
The API service occupied about 22.5 MiB; workers occupied about 129/126 MiB.
Swap contained 32/24 MiB at sampling time; this alone does not indicate current
swap pressure. No error-priority API journal entries were returned for the last hour.
These are snapshots, not a sustained peak-load capacity guarantee.

Database connection was verified against new project `zekvpuhudblrxtlpaaiy`,
with SSL required. Database size: 12,293,811 bytes (11.72 MiB).
Autovacuum was enabled; zero idle-in-transaction sessions were observed.
Public-table statistics contained 73 accounts and six tournaments. Estimated
dead tuples were 21 across the public tables; no mass vacuum or deletion was needed.
Database maintenance and backup retention timers were both active.

Two pg_stat_statements snapshots 35 seconds apart showed no increase in the
version-aware full-tournament read (209 calls), single-tournament read (188),
or summary-list read (129). The scheduled candidate-match lookup increased
by 35 calls and returned zero rows in both cumulative samples. Its total execution
time increased by about 171 ms. This is consistent with lightweight idle polling,
not the previous full-payload download loop.

**Billing egress was not measured.** No authenticated Supabase organization Usage
source was available for this review. The snapshot cannot establish whether a
monthly quota has been exceeded or account for other clients. The admin UI keeps
that distinction explicit and links to Supabase Usage; it never substitutes zero.

The frontend charts use the existing authenticated monitoring response, without
additional polling: Go allocated memory, gateway in-flight tasks, and measured
table sizes. At most 60 samples are retained in the mounted page. History is not
persisted and is not presented as CloudWatch or billing history.

Public tournament `tourn_b6c788` is named `k71 demo`, status FINISHED, champion
K69_CN1. It is now the default viewing selection when there is no active match
session; users can still select another tournament. Its banner is ordered first.

Validation: production Next.js build and TypeScript passed. Chromium checks passed
for the default demo, both themes, 1440/390/320 px layouts, mouse parallax,
swipe, keyboard navigation, autoplay and reduced motion. Monitoring was checked
with explicit local API fixtures (not production data): exact displayed values,
two successive samples, no extra requests, and mobile layout. No page JavaScript
errors were observed. Frontend changes have not yet been published.
