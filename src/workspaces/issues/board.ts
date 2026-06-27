/**
 * Issue board snapshot — the read-only shape GET /api/issues returns, built by
 * SCANNING every workspace's `.alice/issues/` directory (never a central store).
 *
 * This is the board PROJECTION of the issue data model in `./declaration.ts`,
 * sibling to the scheduling projection in `../schedule/declaration.ts`. The board
 * shows ALL issues (scheduled or not); a scheduled issue additionally carries its
 * firing markers (`lastFiredAtMs` / `nextDueAtMs`) so the row matches real firing.
 *
 * Phase 1 is read-only and the list view does NOT include the markdown body — the
 * Phase 2 detail view loads it. Keeping the body out keeps the poll payload small.
 */

import type { InboxEntry } from '../../core/inbox-store.js'
import type { Schedule } from '../../core/schedule-expr.js'
import type { HeadlessTaskRecord } from '../headless-task-registry.js'
import type { IssuePriority, IssueRecord, IssueStatus } from './declaration.js'

/** One board row: the issue's display fields, plus — iff it self-schedules — its
 *  `when` and the scanner's firing markers. No markdown body (Phase 2 loads it). */
export interface IssuesSnapshotIssue {
  id: string
  title: string
  status: IssueStatus
  priority: IssuePriority
  assignee: string
  /** Present iff the issue self-schedules. */
  when?: Schedule
  /** When the scanner last fired this issue (epoch ms); only for scheduled issues. */
  lastFiredAtMs?: number | null
  /** When it is next due (epoch ms); only for scheduled issues. */
  nextDueAtMs?: number | null
  /** True iff this issue's NAME (title, case-insensitive) is also used by an
   *  issue in a DIFFERENT workspace. A name is a global team object, so a clash
   *  across workspaces is ambiguous and the UI warns on it. DETECTION ONLY — we
   *  never lint/reject duplicate names at write time; access stays wsId-precise.
   *  Computed by {@link annotateNameCollisions}; absent ⇒ unique. */
  nameCollision?: boolean
}

export interface IssuesSnapshotWorkspace {
  wsId: string
  tag: string
  /** 'invalid' = the issues dir was unreadable (e.g. a retired `.alice/issue.json`).
   *  A workspace with no issues dir is 'ok' with an empty list — absence is not an
   *  error on the board (it simply contributes no rows). */
  status: 'ok' | 'invalid'
  error?: string
  issues: IssuesSnapshotIssue[]
}

export interface IssuesSnapshot {
  workspaces: IssuesSnapshotWorkspace[]
  /** Display titles (first-seen casing) that occur in MORE THAN ONE workspace —
   *  the cross-workspace name clashes the board warns about. Empty when every
   *  name is globally unique. See {@link annotateNameCollisions}. */
  duplicateNames: string[]
}

/**
 * Detect issue NAMES (title, case-insensitive) that occur across MORE THAN ONE
 * workspace, mark each colliding board row `nameCollision: true` in place, and
 * return the list of colliding display titles (first-seen casing). Two issues
 * sharing a name WITHIN a single workspace are NOT a collision — the model is "a
 * name is a global team object; a clash is two workspaces both claiming it". The
 * scan already loaded every issue, so this is cheap.
 *
 * DETECTION ONLY: nothing here (or anywhere) rejects a duplicate name at write
 * time. The user resolves clashes manually; meanwhile access stays wsId-precise
 * (board rows + the detail route both carry wsId).
 */
export function annotateNameCollisions(workspaces: IssuesSnapshotWorkspace[]): string[] {
  const nameKey = (title: string): string => title.trim().toLowerCase()
  const seen = new Map<string, { wsIds: Set<string>; display: string }>()
  for (const ws of workspaces) {
    for (const issue of ws.issues) {
      const key = nameKey(issue.title)
      if (!key) continue
      const entry = seen.get(key)
      if (entry) entry.wsIds.add(ws.wsId)
      else seen.set(key, { wsIds: new Set([ws.wsId]), display: issue.title.trim() })
    }
  }
  const colliding = new Set<string>()
  const duplicateNames: string[] = []
  for (const [key, entry] of seen) {
    if (entry.wsIds.size > 1) {
      colliding.add(key)
      duplicateNames.push(entry.display)
    }
  }
  if (colliding.size > 0) {
    for (const ws of workspaces) {
      for (const issue of ws.issues) {
        if (colliding.has(nameKey(issue.title))) issue.nameCollision = true
      }
    }
  }
  return duplicateNames
}

/** One issue reference returned by the `[[name]]` resolver — enough to render a
 *  disambiguation candidate and navigate to its wsId-precise detail route
 *  (`/issues/:wsId/:id`). `wsTag` is the human label; `wsId` is the precise key. */
export interface WikilinkIssueRef {
  wsId: string
  wsTag: string
  id: string
  title: string
}

/** The firing markers a scheduled issue carries on the board. Computed by the
 *  caller (from the scanner's marker store + `snapshotScheduledIssue`) so the
 *  board's last/next match the schedule dashboard exactly. */
export interface IssueFiringMarkers {
  lastFiredAtMs: number | null
  nextDueAtMs: number | null
}

// ==================== Detail (Phase 2a) ====================
// The read-only shape GET /api/issues/:wsId/:id returns: one issue's full
// fields INCLUDING the markdown body and (iff scheduled) its firing markers +
// scheduling frontmatter, plus that issue's headless run history (its Activity
// feed). Unlike the board list, the detail loads the body and the runs.

/** One issue's full detail fields: the board row's fields + the markdown body +
 *  the scheduling frontmatter (`what`/`agent`). Markers are present iff scheduled. */
export interface IssueDetailIssue {
  id: string
  title: string
  /** Markdown description body (the list view omits this; the detail loads it). */
  body: string
  status: IssueStatus
  priority: IssuePriority
  assignee: string
  /** Present iff the issue self-schedules. */
  when?: Schedule
  /** Scheduled fire prompt override (frontmatter `what`), if set. */
  what?: string
  /** Adapter id for the scheduled fire (frontmatter `agent`), if set. */
  agent?: string
  /** When the scanner last fired this issue (epoch ms); only for scheduled issues. */
  lastFiredAtMs?: number | null
  /** When it is next due (epoch ms); only for scheduled issues. */
  nextDueAtMs?: number | null
}

/** GET /api/issues/:wsId/:id — one issue + its run history (Activity feed) +
 *  the inbox reports it produced. */
export interface IssueDetail {
  issue: IssueDetailIssue
  /** This issue's headless runs (wsId + issueId match), newest first. */
  runs: HeadlessTaskRecord[]
  /** Inbox reports this issue produced — entries whose server-stamped
   *  `origin.issueId` is this issue, newest-first. The issue→inbox direction of
   *  the cross-link (`runs` is the run→issue one). */
  inboxReports: InboxEntry[]
}

/** Filter a workspace's inbox entries to the ones a given issue produced
 *  (`origin.issueId` match). Pure + order-preserving, so the caller's
 *  newest-first read order carries through. The issue→inbox join, kept in the
 *  domain (not the HTTP route) so every surface — CLI, MCP — gets it. */
export function inboxReportsForIssue(entries: readonly InboxEntry[], issueId: string): InboxEntry[] {
  return entries.filter((e) => e.origin?.issueId === issueId)
}

/** Map a validated issue (+ its firing markers, iff scheduled) to the detail
 *  issue shape. Keeps the body and the scheduling frontmatter the board drops. */
export function detailIssue(
  issue: IssueRecord,
  markers: IssueFiringMarkers | null,
): IssueDetailIssue {
  return {
    id: issue.id,
    title: issue.title,
    body: issue.body,
    status: issue.status,
    priority: issue.priority,
    assignee: issue.assignee,
    ...(issue.when ? { when: issue.when } : {}),
    ...(issue.what ? { what: issue.what } : {}),
    ...(issue.agent ? { agent: issue.agent } : {}),
    ...(markers ? { lastFiredAtMs: markers.lastFiredAtMs, nextDueAtMs: markers.nextDueAtMs } : {}),
  }
}

/** Map one validated issue (+ its firing markers, iff scheduled) to a board row.
 *  Pure: the caller resolves `markers` for scheduled issues and passes `null` for
 *  pure board work items. The markdown body is intentionally dropped. */
export function snapshotBoardIssue(
  issue: IssueRecord,
  markers: IssueFiringMarkers | null,
): IssuesSnapshotIssue {
  return {
    id: issue.id,
    title: issue.title,
    status: issue.status,
    priority: issue.priority,
    assignee: issue.assignee,
    ...(issue.when ? { when: issue.when } : {}),
    ...(markers ? { lastFiredAtMs: markers.lastFiredAtMs, nextDueAtMs: markers.nextDueAtMs } : {}),
  }
}
