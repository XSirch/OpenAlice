import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { initWorkspaceDir, copyReadme, setupGitExcludes, git } from '../_common.mjs'

const tag = process.argv[2]
const outDir = process.argv[3]
if (!tag || !outDir) throw new Error('usage: bootstrap.mjs <tag> <outDir>')

initWorkspaceDir(outDir)
copyReadme(outDir)
await git(['init', '-q'], outDir)
setupGitExcludes(outDir)

const portfolioDir = join(outDir, 'portfolio')
mkdirSync(portfolioDir, { recursive: true })
writeFileSync(join(portfolioDir, 'goal.md'), `---
version: 1
status: needs_user_input
currency: BRL
updatedAt: null
---

# Objetivo atual

Ainda não definido. Na primeira conversa, confirme com o usuário os campos
abaixo antes de preencher este arquivo.

## Resultado desejado

- Objetivo:
- Valor-alvo em reais de hoje:
- Prazo ou data-alvo:
- Prioridade:

## Capacidade financeira

- Aporte inicial adicional:
- Aporte mensal:
- Renda líquida mensal:
- Despesas essenciais mensais:
- Estabilidade e fontes de renda:
- Dependentes e compromissos relevantes:
- Dívidas, taxas e vencimentos:
- Necessidade de renda periódica:
- Reserva de emergência separada:

## Risco e liquidez

- Tolerância a perdas e volatilidade:
- Liquidez necessária:
- Conhecimento e experiência:

## Proteção e aposentadoria

- Seguros e proteções relevantes:
- Regime previdenciário:
- Planos de previdência existentes:
- Renda desejada na aposentadoria:

## Restrições e preferências

- Classes ou emissores a evitar:
- Preferências tributárias:
- Situação tributária relevante:
- Necessidades sucessórias:
- Outras restrições:

## Cobertura patrimonial

- Última leitura do MeuPluggy:
- Instituições ou ativos fora do MeuPluggy:
- Dados pendentes de confirmação:

## Premissas confirmadas

- Nenhuma.
`)

console.log(`bootstrapped Alice Portfolio workspace '${tag}' at ${outDir}`)
