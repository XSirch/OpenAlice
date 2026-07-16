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

## Recovery

Disable the relevant switch on stale data, provider error or suspicious output.
Inspect the append-only signal ledger, Inbox provenance and Connector IO journal.
Guardian restart resumes scheduled work from markers; duplicate lifecycle events
are idempotent. Back up OPENALICE_HOME using documented atomic file copies.
