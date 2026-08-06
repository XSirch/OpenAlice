/**
 * End-to-end check of the create flow, exercising the real moving parts in
 * order: bootstrap.mjs (run on the bundled Node + dugite's bundled git) →
 * launcher context injection → launcher commit. Proves Chat starts a clean
 * local repository, AutoQuant retains its verified upstream ancestry, and —
 * via the PATH-stripped case — creation needs NO system git or bash.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { injectWorkspaceContext } from './context-injector.js';
import type { TemplateMeta } from './template-registry.js';
import { commitInitial } from './workspace-creator.js';

const HERE = fileURLToPath(new URL('.', import.meta.url)); // src/workspaces/
const CHAT_DIR = join(HERE, 'templates', 'chat');
const CHAT_FILES = join(CHAT_DIR, 'files');
const CHAT_BOOTSTRAP = join(CHAT_DIR, 'bootstrap.mjs');
const AQ_DIR = join(HERE, 'templates', 'auto-quant-v2');
const AQ_BOOTSTRAP = join(AQ_DIR, 'bootstrap.mjs');
const ALICE_INVEST_DIR = join(HERE, 'templates', 'alice-invest');
const ALICE_INVEST_FILES = join(ALICE_INVEST_DIR, 'files');
const ALICE_INVEST_BOOTSTRAP = join(ALICE_INVEST_DIR, 'bootstrap.mjs');
const ALICE_PORTFOLIO_DIR = join(HERE, 'templates', 'alice-portfolio');
const ALICE_PORTFOLIO_FILES = join(ALICE_PORTFOLIO_DIR, 'files');
const ALICE_PORTFOLIO_BOOTSTRAP = join(ALICE_PORTFOLIO_DIR, 'bootstrap.mjs');

/**
 * Run a bootstrap.mjs exactly as the launcher's runScript does: on the bundled
 * Node (`process.execPath`) with ELECTRON_RUN_AS_NODE. `strip` removes git/bash
 * from PATH to prove the bare-machine path uses only dugite's embedded git.
 */
function runBootstrap(
  script: string,
  args: readonly string[],
  extraEnv: NodeJS.ProcessEnv,
  strip = false,
): Promise<string> {
  const env = strip
    ? { HOME: process.env.HOME, ELECTRON_RUN_AS_NODE: '1', PATH: '', ...extraEnv }
    : { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...extraEnv };
  return run(process.execPath, [script, ...args], env);
}

function autoQuantMeta(): TemplateMeta {
  return {
    name: 'auto-quant-v2',
    bootstrapScript: AQ_BOOTSTRAP,
    filesDir: join(AQ_DIR, 'files'),
    templateDir: AQ_DIR,
    version: '1.0.0',
    defaultAgents: ['claude', 'codex'],
    injectTools: true,
    injectPersona: false,
    bundledSkills: [],
  };
}

function run(cmd: string, args: readonly string[], env?: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (c: Buffer) => { out += c.toString(); });
    child.stderr.on('data', (c: Buffer) => { err += c.toString(); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err}`))));
  });
}

function chatMeta(): TemplateMeta {
  return {
    name: 'chat',
    bootstrapScript: CHAT_BOOTSTRAP,
    filesDir: CHAT_FILES,
    templateDir: CHAT_DIR,
    version: '1.0.0',
    defaultAgents: ['claude', 'codex'],
    injectTools: true,
    injectPersona: true,
    bundledSkills: ['scan-value-chain', 'delegate-autoquant'],
  };
}

function aliceInvestMeta(): TemplateMeta {
  return {
    name: 'alice-invest',
    bootstrapScript: ALICE_INVEST_BOOTSTRAP,
    filesDir: ALICE_INVEST_FILES,
    templateDir: ALICE_INVEST_DIR,
    version: '1.0.1',
    defaultAgents: ['claude', 'codex'],
    injectTools: false,
    injectPersona: true,
    bundledSkills: [],
    upgradeStrategy: 'managed-context',
  };
}

function alicePortfolioMeta(): TemplateMeta {
  return {
    name: 'alice-portfolio',
    bootstrapScript: ALICE_PORTFOLIO_BOOTSTRAP,
    filesDir: ALICE_PORTFOLIO_FILES,
    templateDir: ALICE_PORTFOLIO_DIR,
    version: '1.0.0',
    defaultAgents: ['codex', 'claude'],
    injectTools: false,
    injectPersona: true,
    bundledSkills: [
      'alice-portfolio',
      'alice-uta',
      'alice',
      'alice-analysis',
      'traderhub',
      'opencli-reader',
    ],
    upgradeStrategy: 'managed-context',
  };
}

let parent: string;
let dir: string;
beforeEach(async () => {
  parent = await mkdtemp(join(tmpdir(), 'ws-e2e-'));
  dir = join(parent, 'workspace');
});
afterEach(async () => {
  await rm(parent, { recursive: true, force: true });
});

describe('chat workspace create: bootstrap → inject → commit', () => {
  it('yields a fresh-git workspace with one clean launcher commit', async () => {
    // 1. real bootstrap.mjs — git init + README + excludes, NO commit. PATH
    //    stripped: proves a bare machine (no system git, no bash) still works
    //    via dugite's bundled git.
    await runBootstrap(CHAT_BOOTSTRAP, ['testtag', dir], { AQ_TEMPLATE_ROOT: CHAT_DIR }, true);
    // 2. launcher-owned injection
    await injectWorkspaceContext({ template: chatMeta(), wsId: 'ws-e2e-1', dir });
    // 3. launcher-owned initial commit
    await commitInitial(dir, 'chat: testtag');

    // injected files all present
    for (const rel of [
      'CLAUDE.md', 'AGENTS.md', 'README.md',
      '.claude/skills/scan-value-chain/SKILL.md',
      '.agents/skills/scan-value-chain/SKILL.md',
      '.claude/skills/delegate-autoquant/SKILL.md',
      '.agents/skills/delegate-autoquant/SKILL.md',
      // per-CLI playbooks injected for every tool-bearing template
      '.claude/skills/alice/SKILL.md',
      '.claude/skills/alice-analysis/SKILL.md',
      '.claude/skills/alice-uta/SKILL.md',
      '.claude/skills/alice-workspace/SKILL.md',
      '.claude/skills/traderhub/SKILL.md',
    ]) {
      expect(existsSync(join(dir, rel)), rel).toBe(true);
    }

    // CLI-only injection: no MCP files are written at all
    expect(existsSync(join(dir, '.mcp.json'))).toBe(false);
    expect(existsSync(join(dir, '.pi/extensions/openalice-bridge.ts'))).toBe(false);

    // exactly one commit, launcher author, right message
    const log = await run('git', ['-C', dir, 'log', '--pretty=%an <%ae>%n%s']);
    expect(log.trim()).toBe('launcher <launcher@local>\nchat: testtag');

    // working tree is clean (injected files were committed, not left dangling)
    const status = await run('git', ['-C', dir, 'status', '--porcelain']);
    expect(status.trim()).toBe('');

    const excludes = await readFile(join(dir, '.git/info/exclude'), 'utf8');
    expect(excludes).toContain('.claude/openalice-provider.json\n');
    expect(excludes).toContain('.opencode/openalice-provider.json\n');
    expect(excludes).toContain('tui.json\n');
  });
});

describe('auto-quant workspace create: clone → branch → commit', () => {
  it('retains verified upstream ancestry and origin under the local research branch', async () => {
    // fake upstream: history + an origin pointing at the public repo
    const src = join(parent, 'fake-auto-quant');
    await run('git', ['init', '-q', '-b', 'main', src]);
    await writeFile(join(src, 'strategy.py'), 'print("hi")\n');
    await writeFile(join(src, 'AGENTS.md'), '# AutoQuant upstream instructions\n');
    await run('git', ['-C', src, 'add', '.']);
    await run('git', ['-C', src, '-c', 'user.email=u@x', '-c', 'user.name=u', 'commit', '-q', '-m', 'upstream history']);
    const sourceCommit = (await run('git', ['-C', src, 'rev-parse', 'HEAD'])).trim();
    await run('git', ['-C', src, 'tag', 'v0.8.27']);
    await run('git', ['-C', src, 'remote', 'add', 'origin', 'https://github.com/TraderAlice/Auto-Quant.git']);

    const aqDir = join(parent, 'aq-workspace');
    await runBootstrap(AQ_BOOTSTRAP, ['aqtag', aqDir], {
      AQ_TEMPLATE_DIR: src,
      AQ_LAUNCHER_ROOT: parent,
      OPENALICE_TEMPLATE_SOURCE_REPOSITORY: 'https://github.com/TraderAlice/Auto-Quant-V2.git',
      OPENALICE_TEMPLATE_SOURCE_VERSION: 'v0.8.27',
      OPENALICE_TEMPLATE_SOURCE_COMMIT: sourceCommit,
    });
    // Preserve AutoQuant's own instructions; inject only OpenAlice CLI skills.
    await injectWorkspaceContext({ template: autoQuantMeta(), wsId: 'ws-aq-1', dir: aqDir });
    await commitInitial(aqDir, 'auto-quant-v2: aqtag');

    // working tree carries the exact upstream content and a source receipt.
    expect(existsSync(join(aqDir, 'strategy.py'))).toBe(true);
    expect((await readFile(join(aqDir, 'AGENTS.md'), 'utf8')).replaceAll('\r\n', '\n'))
      .toBe('# AutoQuant upstream instructions\n');
    expect(existsSync(join(aqDir, '.claude/skills/alice/SKILL.md'))).toBe(true);
    expect(JSON.parse(await readFile(join(aqDir, '.alice/harness-source.json'), 'utf8'))).toEqual({
      schemaVersion: 1,
      template: 'auto-quant-v2',
      repository: 'https://github.com/TraderAlice/Auto-Quant-V2.git',
      version: 'v0.8.27',
      commit: sourceCommit,
    });
    // The launcher commit sits directly on the verified upstream commit, and
    // origin remains the canonical repository for later Agent-managed updates.
    expect((await run('git', ['-C', aqDir, 'rev-parse', 'HEAD^'])).trim()).toBe(sourceCommit);
    expect((await run('git', ['-C', aqDir, 'remote', 'get-url', 'origin'])).trim()).toBe(
      'https://github.com/TraderAlice/Auto-Quant-V2.git',
    );
    expect((await run('git', ['-C', aqDir, 'log', '--pretty=%s'])).trim()).toBe(
      'auto-quant-v2: aqtag\nupstream history',
    );
    expect((await run('git', ['-C', aqDir, 'status', '--porcelain'])).trim()).toBe('');
    expect((await run('git', ['-C', aqDir, 'rev-parse', '--abbrev-ref', 'HEAD'])).trim()).toBe('research/aqtag');
  });
});

describe('chat workspace create — CLI-only injection (no MCP)', () => {
  it('injects the per-CLI alice*/traderhub skills and writes no MCP files', async () => {
    await runBootstrap(CHAT_BOOTSTRAP, ['clitag', dir], { AQ_TEMPLATE_ROOT: CHAT_DIR });
    await injectWorkspaceContext({ template: chatMeta(), wsId: 'ws-cli-1', dir });
    await commitInitial(dir, 'chat: clitag');

    expect(existsSync(join(dir, '.mcp.json'))).toBe(false);                          // no MCP injected
    expect(existsSync(join(dir, '.pi/extensions/openalice-bridge.ts'))).toBe(false); // no Pi bridge
    expect(existsSync(join(dir, '.claude/skills/alice-uta/SKILL.md'))).toBe(true);   // trading skill discoverable
    expect(existsSync(join(dir, '.claude/skills/traderhub/SKILL.md'))).toBe(true);
    expect(existsSync(join(dir, '.claude/skills/scan-value-chain/SKILL.md'))).toBe(true);
    expect(existsSync(join(dir, '.agents/skills/alice-uta/SKILL.md'))).toBe(true); // Pi shares .agents/skills
    expect(existsSync(join(dir, '.pi/skills'))).toBe(false);                       // avoid duplicate discovery
    expect((await run('git', ['-C', dir, 'status', '--porcelain'])).trim()).toBe('');
  });
});

describe('Alice Invest workspace create', () => {
  it('creates the research-only desk with its managed instructions and shadow scan', async () => {
    await runBootstrap(
      ALICE_INVEST_BOOTSTRAP,
      ['portfolio', dir],
      { AQ_TEMPLATE_ROOT: ALICE_INVEST_DIR },
      true,
    );
    await injectWorkspaceContext({
      template: aliceInvestMeta(),
      wsId: 'ws-invest-1',
      dir,
    });
    await commitInitial(dir, 'alice-invest: portfolio');

    const agents = await readFile(join(dir, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('Alice Invest is research-only');
    expect(agents).toContain('Do not use `alice-uta` trading-write commands');
    expect(await readFile(join(dir, 'CLAUDE.md'), 'utf8')).toBe(agents);

    const shadowIssue = await readFile(join(dir, '.alice/issues/b3-shadow.md'), 'utf8');
    expect(shadowIssue).toContain('assignee: "@new-each-run"');
    expect(shadowIssue).toContain('Run only the configured read-only B3 shadow scan');
    expect(shadowIssue).toContain('Do not call Inbox, Connector, Telegram, UTA, broker tools');
    expect(existsSync(join(dir, '.agents/skills/self-scheduling/SKILL.md'))).toBe(true);
    expect(existsSync(join(dir, '.agents/skills/alice-uta/SKILL.md'))).toBe(false);

    const log = await run('git', ['-C', dir, 'log', '--pretty=%an <%ae>%n%s']);
    expect(log.trim()).toBe('launcher <launcher@local>\nalice-invest: portfolio');
    expect((await run('git', ['-C', dir, 'status', '--porcelain'])).trim()).toBe('');
  });
});

describe('Alice Portfolio workspace create', () => {
  it('creates durable goal memory and read-only portfolio guidance', async () => {
    await runBootstrap(
      ALICE_PORTFOLIO_BOOTSTRAP,
      ['aposentadoria', dir],
      { AQ_TEMPLATE_ROOT: ALICE_PORTFOLIO_DIR },
      true,
    );
    await injectWorkspaceContext({
      template: alicePortfolioMeta(),
      wsId: 'ws-portfolio-1',
      dir,
    });
    await commitInitial(dir, 'alice-portfolio: aposentadoria');

    const goal = await readFile(join(dir, 'portfolio/goal.md'), 'utf8');
    expect(goal).toContain('status: needs_user_input');
    expect(goal).toContain('# Objetivo atual');
    expect(goal).toContain('- Renda líquida mensal:');
    expect(goal).toContain('- Dívidas, taxas e vencimentos:');
    expect(goal).toContain('## Proteção e aposentadoria');
    expect(goal).toContain('- Necessidades sucessórias:');
    expect(goal).toContain('## Cobertura patrimonial');

    const agents = await readFile(join(dir, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('O arquivo `portfolio/goal.md` é a memória canônica');
    expect(agents).toContain('Atue como uma assessora patrimonial virtual');
    expect(agents).toContain('Não diga que é CFP®, C-Pro R');
    expect(agents).toContain('Não emita recomendação definitiva enquanto faltarem');
    expect(agents).toContain('nunca envia, prepara, modifica ou cancela ordens');
    expect(await readFile(join(dir, 'CLAUDE.md'), 'utf8')).toBe(agents);

    for (const skill of ['alice-portfolio', 'alice-uta', 'alice', 'alice-analysis', 'traderhub']) {
      expect(existsSync(join(dir, '.agents/skills', skill, 'SKILL.md')), skill).toBe(true);
    }
    const portfolioSkill = await readFile(
      join(dir, '.agents/skills/alice-portfolio/SKILL.md'),
      'utf8',
    );
    expect(portfolioSkill).toContain('alice-uta account portfolio --source meu-pluggy');
    expect(portfolioSkill).toContain('Never say or imply that you hold CFP®, C-Pro R');
    expect(portfolioSkill).toContain('The minimum suitability gate');
    expect(portfolioSkill).toContain('known conflicts/compensation');
    expect(portfolioSkill).toContain('Never invent a rate, fee, yield, CNPJ');
    expect(existsSync(join(dir, '.mcp.json'))).toBe(false);

    const log = await run('git', ['-C', dir, 'log', '--pretty=%an <%ae>%n%s']);
    expect(log.trim()).toBe('launcher <launcher@local>\nalice-portfolio: aposentadoria');
    expect((await run('git', ['-C', dir, 'status', '--porcelain'])).trim()).toBe('');
  });
});
