// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkspacesContextValue } from '../contexts/workspaces-context'
import type { AgentInfo, ManagerWorkspaceSnapshot, SessionRecord } from '../components/workspace/api'
import { i18n } from '../i18n'
import { WorkspaceManagerPage } from './WorkspaceManagerPage'

const mocks = vi.hoisted(() => ({
  useWorkspaces: vi.fn(),
  openOrFocus: vi.fn(),
  setDefaultAgent: vi.fn(),
  getWorkspaceManager: vi.fn(),
  getAgentRuntimeReadiness: vi.fn(),
  probeAgentRuntimeReadiness: vi.fn(),
  listAgentCredentials: vi.fn(),
  quickStartWorkspaceManager: vi.fn(),
  openWebPiSession: vi.fn(),
  resumeSession: vi.fn(),
  getQuickChat: vi.fn(),
  rememberQuickChatCredential: vi.fn(),
}))

vi.mock('../contexts/workspaces-context', () => ({
  useWorkspaces: () => mocks.useWorkspaces(),
}))

vi.mock('../tabs/store', () => ({
  useWorkspace: (selector: (state: { openOrFocus: typeof mocks.openOrFocus }) => unknown) =>
    selector({ openOrFocus: mocks.openOrFocus }),
}))

vi.mock('../components/workspace/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../components/workspace/api')>()
  return {
    ...actual,
    getWorkspaceManager: mocks.getWorkspaceManager,
    getAgentRuntimeReadiness: mocks.getAgentRuntimeReadiness,
    probeAgentRuntimeReadiness: mocks.probeAgentRuntimeReadiness,
    listAgentCredentials: mocks.listAgentCredentials,
    quickStartWorkspaceManager: mocks.quickStartWorkspaceManager,
    openWebPiSession: mocks.openWebPiSession,
    resumeSession: mocks.resumeSession,
  }
})

vi.mock('../api/preferences', () => ({
  preferencesApi: {
    getQuickChat: mocks.getQuickChat,
    rememberQuickChatCredential: mocks.rememberQuickChatCredential,
  },
}))

vi.mock('../components/workspace/Terminal', () => ({
  TerminalView: () => <div data-testid="terminal-view" />,
}))

vi.mock('../components/workspace/WebPiView', () => ({
  WebPiView: () => <div data-testid="webpi-view" />,
}))

const runtimeIds = ['claude', 'codex', 'opencode', 'pi'] as const
const runtimeAgents: AgentInfo[] = [
  ['claude', 'Claude'],
  ['codex', 'Codex'],
  ['opencode', 'OpenCode'],
  ['pi', 'Pi'],
  ['shell', 'Shell'],
].map(([id, displayName]) => ({
  id,
  displayName,
  kind: id === 'shell' ? 'utility' : 'agent',
  installed: true,
  capabilities: {
    parallelPerCwd: true,
    resumeLast: true,
    resumeById: true,
    transcriptDiscovery: 'none',
  },
}))

function managerSnapshot(sessions: readonly SessionRecord[] = []): ManagerWorkspaceSnapshot {
  return {
    id: 'workspace-manager',
    tag: 'Workspace Manager',
    activeWorkspaceCount: 2,
    sessions,
  }
}

function context(defaultAgent: string): WorkspacesContextValue {
  return {
    workspaces: [],
    templates: [],
    agents: runtimeAgents,
    defaultAgent,
    issueDefaultAgent: null,
    listError: null,
    hasLoaded: true,
    templatesLoaded: true,
    refresh: vi.fn(),
    spawn: vi.fn(async () => undefined),
    openHeadlessRun: vi.fn(async () => undefined),
    setDefaultAgent: mocks.setDefaultAgent,
    setIssueDefaultAgent: vi.fn(async () => undefined),
    quickChat: vi.fn(async () => ''),
    pauseSession: vi.fn(async () => undefined),
    resumeSession: vi.fn(async () => undefined),
    openWebPiSession: vi.fn(async () => undefined),
    requestDeleteSession: vi.fn(),
    openAgentConfig: vi.fn(),
    saveWorkspaceMetadata: vi.fn(async () => undefined),
    renameWorkspace: vi.fn(async () => undefined),
  }
}

function readiness() {
  return {
    agents: Object.fromEntries(runtimeIds.map((agent) => [agent, {
      agent,
      displayName: agent,
      installed: true,
      binPath: `/tmp/${agent}`,
      status: 'ready' as const,
      ready: true,
      source: agent === 'pi' ? 'managed-runtime' as const : 'global-login' as const,
      checkedAt: '2026-07-16T00:00:00.000Z',
      durationMs: 1,
    }])),
    overallReady: true,
    checkedAt: '2026-07-16T00:00:00.000Z',
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('en')
  mocks.useWorkspaces.mockImplementation(() => context('codex'))
  mocks.getWorkspaceManager.mockResolvedValue(managerSnapshot())
  mocks.getAgentRuntimeReadiness.mockResolvedValue(readiness())
  mocks.probeAgentRuntimeReadiness.mockResolvedValue(readiness())
  mocks.listAgentCredentials.mockResolvedValue([])
  mocks.getQuickChat.mockResolvedValue({ lastCredentialByAgent: {}, recentChatWorkspaceId: null })
  mocks.rememberQuickChatCredential.mockResolvedValue(undefined)
  mocks.openWebPiSession.mockResolvedValue(undefined)
  mocks.resumeSession.mockResolvedValue({})
  mocks.quickStartWorkspaceManager.mockResolvedValue({
    manager: managerSnapshot(),
    session: {
      id: 'manager-session',
      resumeId: 'manager-resume',
      wsId: 'workspace-manager',
      agent: 'claude',
      name: 'c1',
      createdAt: '2026-07-16T00:00:00.000Z',
      lastActiveAt: '2026-07-16T00:00:00.000Z',
      state: 'running',
      surface: 'terminal',
      pid: 1,
      startedAt: 1,
      title: 'Inspect the floor.',
    },
    snapshot: null,
  })
})

afterEach(cleanup)

describe('WorkspaceManagerPage runtime selection', () => {
  it('uses the Quick Chat runtime catalog and launches the selected native runtime', async () => {
    render(<WorkspaceManagerPage spec={{ kind: 'workspace-manager', params: {} }} />)

    const picker = await screen.findByRole('button', { name: 'Select agent' })
    expect(picker.textContent).toContain('Codex')
    fireEvent.click(picker)

    for (const name of ['Claude', 'Codex', 'OpenCode', 'Pi']) {
      expect(screen.getByRole('menuitem', { name })).toBeTruthy()
    }
    expect(screen.queryByRole('menuitem', { name: 'Shell' })).toBeNull()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Claude' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Inspect the floor.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start manager' }))

    await waitFor(() => expect(mocks.quickStartWorkspaceManager).toHaveBeenCalledWith(
      'Inspect the floor.',
      'claude',
      undefined,
    ))
    expect(mocks.setDefaultAgent).toHaveBeenCalledWith('claude')
    expect(mocks.openOrFocus).toHaveBeenCalledWith({
      kind: 'workspace-manager',
      params: { sessionId: 'manager-session' },
    })
  })

  it('keeps the loginless provider selection in the shared per-runtime preferences', async () => {
    mocks.useWorkspaces.mockImplementation(() => context('pi'))
    mocks.listAgentCredentials.mockResolvedValue([{
      slug: 'google-1',
      label: 'Gemini',
      vendor: 'google',
      authType: 'api-key',
      wires: { 'google-generative-ai': 'https://generativelanguage.googleapis.com/v1beta' },
      resolvedModel: 'gemini-3.1-flash-lite',
    }])
    mocks.getQuickChat.mockResolvedValue({
      lastCredentialByAgent: { pi: 'google-1' },
      recentChatWorkspaceId: null,
    })

    render(<WorkspaceManagerPage spec={{ kind: 'workspace-manager', params: {} }} />)

    await screen.findByRole('combobox', { name: 'AI provider' })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Audit issues.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start manager' }))

    await waitFor(() => expect(mocks.quickStartWorkspaceManager).toHaveBeenCalledWith(
      'Audit issues.',
      'pi',
      'google-1',
    ))
  })

  it('resumes a paused non-Pi Manager Session through the native terminal path', async () => {
    const session: SessionRecord = {
      id: 'manager-codex',
      resumeId: 'manager-codex-resume',
      wsId: 'workspace-manager',
      agent: 'codex',
      name: 'x1',
      createdAt: '2026-07-16T00:00:00.000Z',
      lastActiveAt: '2026-07-16T00:00:00.000Z',
      state: 'paused',
      surface: 'terminal',
      pid: null,
      startedAt: null,
      title: 'Resume native manager',
    }
    const snapshot = managerSnapshot([session])
    mocks.getWorkspaceManager.mockResolvedValue(snapshot)

    render(<WorkspaceManagerPage spec={{
      kind: 'workspace-manager',
      params: { sessionId: session.id },
    }} />)

    await waitFor(() => expect(mocks.resumeSession).toHaveBeenCalledWith(
      'workspace-manager',
      session.id,
    ))
    expect(mocks.openWebPiSession).not.toHaveBeenCalled()
    expect(screen.getByTestId('terminal-view')).toBeTruthy()
  })
})
