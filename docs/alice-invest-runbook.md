# Alice Invest runbook

## Safe startup

1. Start Guardian/Alice normally. UTA is optional and must remain read-only or
   absent for Alice Invest.
2. Confirm every Alice Invest switch is off and every capability is not_ready
   or research_only.
3. Configure only sealed, least-privilege provider and Connector credentials.

## Shadow and paper alerts

Run scheduled Issues in shadow mode until reproducible evidence covers source
freshness, stale/outage counts, dedupe and lifecycle transitions. Enable paper
alerts only after the relevant readiness capability is paper_alerts; Inbox
persists before Connector delivery. Never treat outbound delivery as evidence.

As of the 2026-07-16 backlog audit, no temporal shadow run is recorded for B3
or crypto. The implemented fixture/temporary-ledger cycles are infrastructure
only. Do not represent them as a provider validation, a shadow result, or an
operational readiness promotion.

## Recovery

Disable the relevant switch on stale data, provider error or suspicious output.
Inspect the append-only signal ledger, Inbox provenance and Connector IO journal.
Guardian restart resumes scheduled work from markers; duplicate lifecycle events
are idempotent. Back up OPENALICE_HOME using documented atomic file copies.

## Active signal monitor

The monitor is a bounded supervised tick, never an agent loop. A tick first
persists its lifecycle event, then attempts Inbox delivery only for a
`paper_alerts` capability with notifications enabled. Its delivery receipt is
durable, so a later tick can retry a transient Inbox failure without adding a
second lifecycle event. B3 observes the configured market-open gate; crypto is
24/7. Stale or absent source timestamps fail closed. For a candle that crosses
both stop and target, the deterministic policy attributes the stop first.

Do not enable monitoring or alerts as evidence. Guardian integration and real
source input still require the pending backlog work; temporal shadow evidence
is required before any readiness promotion.
