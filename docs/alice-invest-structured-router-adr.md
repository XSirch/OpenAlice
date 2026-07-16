# ADR: structured router for Alice Invest

Status: accepted for implementation by `AINV-T301`.

## Context

Alice owns Workspace, Session and credential-injection boundaries, while native
CLIs own their own model loops. The Alice Invest router needs a small,
programmatic, fail-closed classification for ambiguous messages. It must not
become a second general-purpose agent loop and it must never select an
execution capability.

The repository already supports a sealed `Custom` credential with an
`openai-chat` wire. It can be configured with
`https://openrouter.ai/api/v1`; Pi and opencode can use that wire through their
native runtime configuration.

## Options considered

| Option | Decision |
| --- | --- |
| Native Pi/opencode turn | Reject for the structured-router hot path. It owns a full agent loop and session context, cannot provide Alice a narrow synchronous schema contract, and makes bounded latency, usage accounting and retries indirect. It remains the path for user-facing work. |
| Direct, narrow Alice Invest client | Choose. It can submit only the router schema, apply timeout/retry/cost/context caps before dispatch, validate the response before use, and emit redacted telemetry. It is not a general agent loop and cannot call tools. |
| Deterministic local rules | Choose for the fast path and fallback. Known commands, unambiguous advisory requests and any execution request never call a model. Rules cannot replace clarification for all ambiguous or multi-intent input. |

## Decision and constraints

`AINV-T301` will implement only the direct structured-router client, behind the
sealed credential boundary, plus the local fast path from `AINV-T400`. The
client receives a bounded, allowlisted context and can return only a
schema-validated routing result. Invalid JSON, a schema mismatch, timeout,
budget exhaustion or non-transient provider error produces
`ask_clarification`; it never falls back to an agent turn or tool invocation.

The implementation must preserve correlation identifiers and record only
purpose, requested/resolved model, latency, token/cost counters, outcome and
redacted error class. Keys, raw credential values and unbounded prompts are
never logged. A provider/model is configuration, not source code. The maximum
product readiness remains `paper_alerts` and `execution_enabled` remains
false.

## Measurement record

No isolated live experiment was run: this checkout has no owner-designated
Custom/OpenRouter experiment credential, and existing sealed credentials must
not be inspected or repurposed. This is an explicit blocker, not a substitute
for production measurement.

Before enabling the integration, run a bounded experiment with an owner-created
Custom credential and representative non-sensitive fixtures. Record p50/p95
latency, provider-reported token/cost data, valid-schema rate, 429/5xx/timeout
behavior, fallback result, and redaction evidence. The experiment must use the
same vault boundary and must not send market, account, or personal data.

## Consequences

The direct client adds a small provider boundary to Alice Invest, so it needs
fake-server tests for structured output and failure handling. A dedicated
OpenRouter visual preset is deferred: the existing Custom preset is sufficient
and no provider-specific UI is justified by this decision.
