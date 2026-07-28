# Alice Invest — escopo tributário brasileiro

Este documento define os limites do Alice Invest para dados tributários. O
produto não é contador, não presta aconselhamento tributário individual e não
envia declarações, DARFs, pagamentos, ordens ou instruções a órgãos públicos.

## Estado atual

`alice-invest-tax-policy.json` é semeado em modo **fail-closed**. Nenhum
cálculo ou recomendação fiscal é habilitado por uma integração de custódia, por
uma cotação, nem por dados inferidos do nome de um ativo. Qualquer futura saída
deve portar literalmente este aviso:

> Estimativa informativa para conferência. Não constitui aconselhamento
> tributário, declaração, DARF ou pagamento.

## Evidência necessária por classe

| Classe | Evidência mínima antes de qualquer estimativa futura |
| --- | --- |
| Ações, ETFs e FIIs B3 | Nota de corretagem e histórico de operações |
| Renda fixa e fundos | Extrato de custódia e comprovante de retenção quando aplicável |
| Cripto | Histórico de operações da corretora/carteira |

Preço atual, valor de custódia, aporte agregado, categoria inferida ou resposta
de um provedor não substituem os documentos acima. Dados ausentes devem ser
mostrados como lacuna, nunca completados por estimativa silenciosa.

## Premissas e lacunas

- Regras, alíquotas, isenções, compensação de prejuízos e obrigações acessórias
  mudam; elas só poderão ser parametrizadas após revisão humana documentada por
  classe de ativo.
- Cada cálculo futuro deverá registrar ano-calendário, data-base, fontes,
  operações, taxas, impostos retidos, versão das regras e revisão humana.
- O escopo não cobre declaração, recolhimento, geração de DARF, recomendação de
  operação, ativos no exterior, câmbio ou situações pessoais sem uma entrega
  específica e revisada.

Antes de disponibilizar uma estimativa, o proprietário deve submetê-la à revisão
de um contador ou consultor tributário habilitado. Essa revisão é uma condição
de validação humana, não um sinal para habilitar execução financeira.

## Regras codificadas de forma limitada

O primeiro estimador é uma ferramenta de conferência, bloqueada pela política
até que exista revisão humana. Ele separa operações comuns de ações B3, FIIs,
renda fixa, fundos e cripto e devolve `unassessable` quando faltam dados ou a
classe exige tratamento específico. Não compensa prejuízos anteriores, não
abate IRRF, nem processa day trade.

As referências de parametrização são a Receita Federal: [operações em bolsa e
deduções](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/pagamento/renda-variavel/bolsa-de-valores-1),
[isenção mensal de ações](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/pagamento/renda-variavel/bolsa-de-valores-1/isencoes),
[FII](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/pagamento/renda-variavel/fundos-de-investimento-no-brasil)
e [tabelas de renda fixa de 2026](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026).
