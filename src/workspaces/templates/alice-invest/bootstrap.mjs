import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { initWorkspaceDir, copyReadme, setupGitExcludes, git } from '../_common.mjs'
const [tag,outDir]=process.argv.slice(2)
if(!tag||!outDir)throw new Error('usage: bootstrap.mjs <tag> <outDir>')
initWorkspaceDir(outDir);copyReadme(outDir);await git(['init','-q'],outDir);setupGitExcludes(outDir)
const issues=join(outDir,'.alice','issues');mkdirSync(issues,{recursive:true})
writeFileSync(join(issues,'b3-shadow.md'),`---\ntitle: B3 shadow scan\nstatus: todo\npriority: low\nassignee: "@workspace"\nwhen: { kind: cron, cron: "*/15 10-17 * * 1-5", timezone: America/Sao_Paulo }\nagent: codex\n---\nRun only the configured read-only B3 shadow scan. Check kill switch, B3 session, realtime freshness and source evidence. Record candidates and lifecycle metrics in the Alice Invest signal ledger. Do not call Inbox, Connector, Telegram, UTA, broker tools, or submit an order. If no valid source/candidate exists, record the reason and exit silently.\n`)
console.log(`bootstrapped Alice Invest workspace '${tag}' at ${outDir}`)
