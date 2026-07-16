# Alice Invest signals

Signals are informational BUY candidates only. They use Decimal strings,
provenance, target, stop and expiry; no formatter or alert can submit an order.
Shadow scans record lifecycle evidence first. Paper alerts require the matching
capability to be paper_alerts and signal_notifications_enabled; Inbox is the
durable outbound boundary. B3 and crypto readiness are independent.

## Monitor

The Guardian-supervised scheduled Issue evaluates active signals at most once
per minute. It never calls an LLM. Stop and expiry transitions are idempotent;
closed B3 sessions and stale providers produce no transition.
