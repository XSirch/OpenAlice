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

### Environment remediation rerun

- Added `C:\Program Files\Git\cmd` to the user `PATH`; Git reports
  `2.55.0.windows.1` and Docker Engine reports `28.5.1 linux`.

| Command | Result | Duration / evidence |
| --- | --- | --- |
| `pnpm test:e2e -- --reporter=verbose` | Passed | The three Workspace creation tests that previously failed now passed; the selected market-data checks remained skipped only for absent provider keys. |
| `pnpm docker:smoke -- --skip-build --image openalice:validation-rerun` | Passed | HTTP readiness, all four runtime detections, Chat Workspace, PTY/`alice` manifest round trip, and offboarding passed. The temporary caller-owned image was removed afterwards. |

### Complete validation matrix on dev

- Base under test: `5f9d9ea6`, immediately before the documentation-only
  evidence update. Git was explicitly prepended from
  `C:\Program Files\Git\cmd` for the E2E process because the already-open
  terminal had not inherited the updated user `PATH`.

| Command | Result | Duration / evidence |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | Passed | 933 ms. |
| `npx tsc --noEmit` | Passed | Completed with only the known npm project-config warning. |
| `cd ui && npx tsc -b` | Passed | Completed successfully. |
| `pnpm test` | Passed | 345 files passed, 2 skipped; 3,176 tests passed, 22 skipped; 25.90 s. |
| `pnpm test:connector-replay` | Passed | 3 files and 11 tests passed; 238 ms. |
| `pnpm test:connector-service` | Passed | Rebuilt `connector.cjs` then completed the isolated process/journal smoke. |
| `PATH=C:\Program Files\Git\cmd;$PATH pnpm test:e2e` | Passed | Workspace creation passed; 14 provider-dependent tests skipped because credentials were not configured. |
| `pnpm docker:smoke` | Passed | Isolated image build plus HTTP, agent inventory, Workspace PTY/CLI round trip and offboarding completed; owned resources were cleaned. |

### Results

- Connector smoke: passed; build is deterministic and the smoke retains its
  cleanup path.
- Guardian runtime: resolved from workspace source; the complete local E2E
  rerun passed after Git was restored to `PATH`.
- Inbound bridge: focused route test proves `503` while WorkspaceService is
  unavailable and `202` after it becomes available. Alice no longer exits
  merely because that optional dependency is late.
- Docker smoke: passed after Docker Desktop Linux Engine was started.

### Remaining failures

- No remaining local blocker from the Connector smoke, Guardian-runtime
  resolution, or Docker inbound-bridge startup checks.
- The remaining validation blocker is CI publication: PR #1 promoted `dev` to
  `master`, but no configured validation workflow has executed successfully
  for the current `master` commit.

### Readiness conclusion

`global=not_ready`; `fixed_income=research_only`; `b3_signals=research_only`;
`crypto_signals=research_only`. No capability was promoted and
`execution_enabled` remains `false`.

## Remaining backlog execution

### Base commit

- `fef8b9f2`, the current `master` at branch creation.

### Branch

- `feat/alice-invest-complete-remaining-backlog`.

### Tasks discovered

- 90 total tasks. The DAG parsed with unique IDs and existing dependencies.

### Tasks completed and validated

- A versioned migration and private, idempotent `ReadinessEvidence` journal
  preserve evidence across restarts. Its projection fails closed for every
  capability and never derives readiness from a UI switch or fixture.
- The read-only Alice Invest API emits only criterion, status, timestamp,
  source and bounded details. It omits evidence IDs, validation run IDs and
  raw payloads. The UI visibly separates derived readiness from configuration.
- The signal monitor now records target, stop/invalidated, expiry, trailing
  activation and monotonic trailing updates. It uses stop-first attribution for
  a candle that crosses both stop and target, stores a durable delivery receipt,
  and retries an Inbox failure on a later tick without a second ledger event.

### Tasks still pending

- None. The final local reconciliation contains 9 `done`, 44 `implemented`,
  13 `validated`, and 24 externally `blocked` tasks. Production real-source
  input remains external work; Guardian-supervised monitor mounting, durable
  diagnostic telemetry, and operational API/UI render validation are locally
  validated.
- The full monorepo suite was run twice; one parallel run reported unrelated
  flaky failures in `headless-task-registry` and UTA broker-pack loading, while
  both files passed together in the focused rerun. This is not recorded as a
  green complete-suite validation.

### Tasks blocked

- 24 tasks are blocked by owner Telegram bot/private chat, owner-authorized
  OpenRouter credential, read-only B3 and crypto sources, temporal shadow
  observation, or a green GitHub Actions run. Each corresponding backlog task
  records a concrete `next_action`; no fixture was used as external evidence.

### Code changes and migrations

- `src/migrations/0027_alice_invest_readiness_evidence` seeds the migrated
  evidence journal. `src/migrations/registry.ts` and the generated index
  include it.
- Monitor transition, runner and delivery-receipt code live under
  `src/domain/alice-invest/signals/` and have no broker, UTA write, LLM loop,
  or financial execution path.

### Tests

| Command | Result |
| --- | --- |
| Focused evidence, projection, route and migration specs | Passed |
| Focused monitor, delivery store, runner and ledger specs | Passed: 4 files, 11 tests |
| `npx tsc --noEmit` | Passed after the monitor/UI changes |
| `cd ui && npx tsc -b` | Passed |
| `pnpm test:connector-replay` | Passed: 3 files, 11 tests |
| `pnpm test:connector-service` | Passed |
| Full `pnpm test` | Passed: 354 files, 3,195 tests; 2 files and 22 tests skipped |
| Docker smoke | Must be rerun with a retained final result before it is recorded as passed |

### CI and readiness

- `.github/workflows/alice-invest-validation.yml` runs the requested matrix in
  separate checks/Docker jobs, enables Corepack, caches pnpm, and emits a
  fail-closed readiness/financial-execution summary. It completed successfully
  for PR #3 and merge commit `56a09d14` on 2026-07-17:
  https://github.com/XSirch/OpenAlice/actions/runs/29610105448.
- Final readiness remains `global=not_ready`,
  `fixed_income=research_only`, `b3_signals=research_only`, and
  `crypto_signals=research_only`; `execution_enabled=false`.

### Required owner actions

1. Configure and authorize the least-privilege external credentials and
   controlled temporal tests listed in `tasks.json`.
2. Publish this branch and run the GitHub Actions workflow through a master PR.
3. Do not promote any capability until the persisted, source-backed evidence
   has satisfied every criterion.
