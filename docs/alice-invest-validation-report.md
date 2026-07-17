# Alice Invest validation report

## Audit baseline

- Audit date: 2026-07-16
- Audited commit before this change: `d56a7c7c9c7b6fc5755ed7ed62b45e5fcac4c661`
- Environment: local Windows workspace; no credentials were inspected,
  configured, reused, or logged.
- Readiness conclusion: `global=not_ready`; `fixed_income=research_only`;
  `b3_signals=research_only`; `crypto_signals=research_only`.
- Execution conclusion: structurally disabled; no order, Telegram, OpenRouter,
  B3, or crypto real integration was invoked.

## Local command record

| Command | Result | Duration / evidence |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | Passed via `corepack pnpm` | 268 ms; direct `pnpm` was unavailable in this shell. |
| `npx tsc --noEmit` | Passed | 7.79 s; emitted only an npm project-config warning. |
| `pnpm test` | Passed via `corepack pnpm` | Final run: 23.72 s; 345 files passed, 2 skipped; 3,175 tests passed, 22 skipped. An intermediate run exposed an outdated default-readiness expectation, which this change corrected before the final passing run. |
| `pnpm test:connector-replay` | Passed via `corepack pnpm` | 241 ms; 3 files and 11 tests passed. |
| `pnpm test:connector-service` | Failed via `corepack pnpm` | Missing `services/connector/dist/connector.cjs`; the smoke requires a built Connector artifact. |
| `pnpm test:e2e` | Failed via `corepack pnpm` | 21.10 s; Vite could not resolve `@traderalice/guardian-runtime`. |
| `cd ui && npx tsc -b` | Passed | Executed concurrently with the focused checks; the shell did not emit a separate duration. |
| `pnpm docker:smoke` | Failed via `corepack pnpm` | Image built, then Alice exited because the Connector inbound bridge found Workspace service unavailable. |

## External and temporal evidence

- B3 intraday source: blocked; requires an owner-configured read-only source
  and an observed capture with timestamps, delay, quote availability, and
  reconnect result.
- Crypto spot source: blocked; requires an owner-configured least-privilege
  read-only source with no withdrawal, margin, futures, or leverage.
- B3 and crypto shadow execution: blocked; no date-bounded real run or
  reproducible evidence report exists.
- Telegram inbound/outbound E2E: blocked; requires the owner's bot and linked
  private chat.
- OpenRouter probe: blocked; requires an owner-created sealed Custom
  experiment credential.

## Remaining gaps

Fixtures, source evaluators, a boolean readiness core, a configuration snapshot,
and isolated Connector tests prove implementation boundaries only. They do not
prove provider freshness, temporal lifecycle behavior, real delivery, or
operational readiness. See `tasks.json` for the blocked and pending graph.

## Validation rerun after blocker fixes

### Commit

- Base: `b6094a94aa63ab234afbb97f6846df43b6ffe202`.
- Fix branch: `fix/alice-invest-validation-blockers`, published at
  `0d805171fc2cb3c739a1bc97ae9cd7bd22a176da`. No CI link exists yet.

### Environment

- Windows local workspace, 2026-07-17; Node `v24.18.0`, pnpm `11.7.0`.
- No external credentials were used and no financial order was submitted.
- The shell did not expose Git on `PATH`, although Git exists at
  `C:\Program Files\Git\cmd\git.exe`. Docker Desktop's Linux Engine was not
  running.
- `origin` exposes `master` but no `dev` branch, and GitHub CLI is not
  installed; a policy-compliant PR to `dev` could not be created from this
  environment.

### Root causes

- `test:connector-service` launched `services/connector/dist/connector.cjs`
  without building it first.
- `vitest.e2e.config.ts` lacked the Guardian runtime source alias already used
  by the standard Vitest configuration.
- WebPlugin mounted the authenticated inbound route before WorkspaceService was
  constructed and synchronously threw when the service reference was empty.

### Changes

- Added `build:connector`; Connector process smoke now builds before it starts.
- Added the Guardian runtime workspace-source alias to the E2E resolver.
- Made inbound route handlers resolve WorkspaceService lazily. Bootstrap
  unavailability is an authenticated `503`, so no envelope is accepted before
  its destination exists and a later retry can succeed.

### Commands

| Command | Result | Duration / evidence |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | Passed | 321 ms. |
| `npx tsc --noEmit` | Passed | 14.5 s; only npm project-config warning. |
| `cd ui && npx tsc -b` | Passed | 28 s. |
| `pnpm test src/webui/routes/connector-inbound.spec.ts` | Passed | 1.22 s; 1 file, 3 tests. |
| `pnpm test:connector-service` | Passed | Connector rebuilt (`connector.cjs`, 5.04 MB) then process/journal smoke passed. |
| `pnpm test:e2e` | Failed after package resolution | 28.25 s; 3 workspace-creation tests failed with `spawn git ENOENT` because Git was absent from this shell `PATH`. The former Guardian-runtime resolution error did not recur. |
| `pnpm docker:smoke` | Blocked | Docker Desktop Linux Engine pipe was absent before build/run. |

### Results

- Connector smoke: passed; build is deterministic and the smoke retains its
  cleanup path.
- Guardian runtime: resolved from workspace source; E2E reached workspace
  creation and real UTA E2E checks before the unrelated Git environment block.
- Inbound bridge: focused route test proves `503` while WorkspaceService is
  unavailable and `202` after it becomes available. Alice no longer exits
  merely because that optional dependency is late.

### Remaining failures

- Full E2E cannot be marked passed in this shell until Git is made available on
  `PATH` (or is verified in CI/Linux).
- Docker smoke cannot run until Docker Desktop's Linux Engine is started.
- `pnpm test` and `pnpm test:connector-replay` were invoked during this rerun,
  but their final summaries were not captured by the session runner; they are
  intentionally not claimed as passing evidence here.

### Readiness conclusion

`global=not_ready`; `fixed_income=research_only`; `b3_signals=research_only`;
`crypto_signals=research_only`. No capability was promoted and
`execution_enabled` remains `false`.
