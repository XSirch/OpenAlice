# ADR: monitor de sinais Alice Invest

## Decisão

Usar um Issue agendado, com executor determinístico e idempotente, para o
monitor v1. Não introduzir um processo de polling/WebSocket dedicado.

## Evidência e comparação

Os shadow modes B3 e cripto já escrevem ciclos idempotentes no ledger sem
Inbox, Connector, UTA ou LLM. As fixtures cobrem sinal vazio/bloqueado e
duplicação; cada ciclo é limitado ao conjunto de sinais ativos. A B3 usa a
janela de mercado `America/Sao_Paulo`; cripto é 24/7. Ambos bloqueiam dados
stale ou fonte indisponível antes de avaliar transições.

| Alternativa | Vantagem | Risco/decisão |
| --- | --- | --- |
| Issue agendado | Guardian já supervisiona restart, health, markers e até 8 execuções | Escolhida para cadência de minutos e carga limitada |
| Serviço contínuo | Menor latência e WebSocket | Adiar: exige lifecycle, backoff, reconexão e custo operacional próprios |

O ScheduleScanner dispara aproximadamente a cada 60 s. Para v1, os Issues
devem rodar no máximo uma vez por minuto para sinais ativos, e somente quando
`active_signal_monitor_enabled` estiver ativo. B3 fechado não chama fonte
intraday; cripto pode continuar independentemente. Cada ciclo mede gap desde a
última observação, stale, indisponibilidade, duplicação, custo e latência.

## Regras operacionais

- O monitor lê somente dados e ledger; nunca chama LLM, Connector, UTA ou uma
  ordem e não usa loops/sleep dentro de agentes.
- Target, stop, trailing, expiração e invalidação são transições idempotentes;
  o sinal original é preservado.
- Após restart, markers e ledger retomam o próximo ciclo sem reenviar uma
  transição já registrada.
- O health exibirá ciclo atrasado, fonte stale, mercado fechado, capacidade
  headless e último erro.

## Reconsideração

Adotar serviço Guardian supervisionado somente se a evidência shadow mostrar
que o gap de até ~60 s perde transições relevantes, se a quantidade de sinais
ativos exceder a capacidade do scanner, ou se um provedor exigir WebSocket
para satisfazer freshness. A mudança deve trazer medição de carga, custo,
reconexão, restart e teste de recuperação antes de substituir o Issue.
