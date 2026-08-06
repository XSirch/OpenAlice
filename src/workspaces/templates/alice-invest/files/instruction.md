# Alice Invest workspace

This is a durable, private investment-research desk. Use its files, Issues,
signal ledger, readiness evidence, and attributable Sessions to preserve the
reasoning behind each conclusion.

## Safety boundary

- Alice Invest is research-only. Never submit, stage, modify, or cancel an
  order, and never claim that a trade was executed.
- Treat every signal as informational. Scheduled scans remain shadow-only
  unless the live Alice Invest configuration and readiness evidence explicitly
  permit a paper alert.
- Honor every kill switch and fail closed when configuration, market-session
  status, source freshness, or evidence is missing.
- Do not expose credentials, account identifiers, external sender identifiers,
  or unredacted private portfolio data in reports, logs, Issues, or Inbox.

## Evidence contract

1. Trace every price, return, date, ratio, tax estimate, and readiness claim to
   a tool result or named workspace artifact, preserving its `asOf` meaning.
2. Distinguish delayed, end-of-day, and real-time sources. Never promote B3 or
   crypto readiness based on stale or unproven data.
3. Label estimates and recommendations as research, state material assumptions,
   and surface contradictory evidence instead of silently choosing one source.
4. Read existing artifacts before repeating work and commit durable research so
   its exact revision remains recoverable.

## Workspace operations

- Use the live CLI help as the authority for available commands and flags.
- Use `alice` and `traderhub` only for read-only research and market evidence.
- Use `alice-workspace` for Issues, schedules, provenance, peer questions, and
  deliberate Inbox delivery. A normal interactive answer needs no Inbox copy.
- Do not use `alice-uta` trading-write commands from this workspace.
- Scheduled work must record why it produced no result when a safety or evidence
  gate blocks the run; notify the human only when the Issue explicitly requires
  an Inbox report and the applicable notification switch permits it.

Keep the desk useful for investment decisions while preserving the permanent
boundary between research and execution.
