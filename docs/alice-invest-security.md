# Alice Invest Security

This guide owns the Alice Invest safety foundation. It applies before Telegram
inbound, model routing, market scans, signals, or alerts are enabled.

## Invariants

- `execution_enabled` is a literal `false`, not an operator switch.
- The highest enabled readiness state is `paper_alerts`.
- All capabilities start at `not_ready`.
- Broker writes remain owned by UTA and are absent from Alice Invest.
- Secrets remain in existing sealed credential/config stores; the Alice Invest
  config contains no secret fields.

## Configuration

`data/config/alice-invest.json` is a private, atomic JSON configuration owned
by `src/core/alice-invest-config.ts`. Migration `0024_alice_invest_config`
seeds the fail-closed default and leaves malformed existing input untouched so
the reader rejects it rather than silently broadening permissions.

The configuration defines four default-off kill switches:

- `telegram_inbound_enabled`
- `market_scans_enabled`
- `signal_notifications_enabled`
- `active_signal_monitor_enabled`

It also bounds inbound text, external identifiers, correlation IDs, and pending
inbound messages. Future callers must enforce those limits before persistence
or dispatch.

## File and log policy

Alice Invest state is written owner-private (`0600` where the platform supports
it) through atomic temporary-file replacement. Product paths must be non-empty,
relative, and unable to escape their configured root. Absolute paths, traversal,
and NUL bytes are rejected.

Correlation is required for future inbound, routing, run, Inbox, and delivery
events. External identifiers must be redacted or pseudonymized before logs,
metrics, or durable diagnostics. Keys, bot tokens, account data, and raw sealed
credential content must never be logged, exposed by API/UI, or committed.

## Failure posture

Invalid configuration, unknown readiness state, forbidden path, missing safety
evidence, or unavailable dependency fails closed. A later task may make an
authorized capability usable only after its specific evidence satisfies the
readiness core; no fallback may enable execution or bypass a kill switch.
