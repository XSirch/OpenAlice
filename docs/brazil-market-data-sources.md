# Fontes de dados do mercado brasileiro

Este catálogo é o contrato operacional das superfícies Brasil-first. Ele não
autoriza um fornecedor novo por si só: toda ativação continua sujeita à revisão
dos termos vigentes pelo proprietário e à classificação explícita na interface.

| Fonte | Uso permitido no produto | Classificação | Data-base | Limite |
| --- | --- | --- | --- | --- |
| Banco Central do Brasil, SGS | Selic, CDI, IPCA, câmbio e demais séries oficiais | `official_reference` ou `derived` | data da observação SGS | não é cotação ou sinal executável |
| CVM Dados Abertos | DFP, ITR, cadastro e documentos públicos de emissores/fundos | `official_reference` | competência e data de protocolo/publicação | exige mapeamento verificável de ticker para código CVM |
| B3/fornecedor licenciado | eventos corporativos e dados de mercado contratados | declarado pelo contrato | evento ou horário fornecido | só pode alegar realtime após evidência do contrato e captura real |
| BRAPI/HG Brasil | pesquisa de cotação, barras e fundamentos oferecidos pelo fornecedor | `delayed_market` | data devolvida pela resposta | nunca satisfaz gate B3 realtime ou rota de ordem |
| Yahoo Finance | fechamento e referência complementar de índices | `delayed_market` | data do fechamento devolvido | não substituir fonte B3 licenciada |

## Regras de proveniência

Cada cartão, tabela, exportação e alerta deve carregar: fornecedor, identificador
de série/documento quando houver, classificação, data-base e horário de coleta.
Dados derivados preservam a fonte oficial de entrada e são marcados como
`derived`.

Falhas e dados vencidos são visíveis. Cache reduz chamadas, mas nunca altera a
data-base, a classificação ou a origem. Dados sem proveniência não alimentam
alertas, métricas de retorno ou qualquer readiness.

## Segurança e readiness

- Nenhuma destas fontes habilita ordens: `execution_enabled` permanece `false`.
- Dados B3 atrasados continuam `research_only`.
- Credenciais de fornecedores ficam somente no vault/configuração selada e não
  entram em documentos, logs, fixtures ou exportações.
- A ativação de qualquer dado pago/licenciado requer registrar o plano, os
  termos revisados e uma evidência externa sem segredo.
