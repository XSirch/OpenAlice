# Viabilidade das fontes de renda fixa

Consulta realizada em **20 de agosto de 2026**. Este documento é a matriz de
decisão do Incremento 0 do assessor de renda fixa. Ele avalia somente fontes
primárias oficiais, públicas e gratuitas. Não autoriza coleta de área privada,
contorno de autenticação, automação de interface não documentada nem
redistribuição além do que a licença da fonte permite.

Esta é uma avaliação técnica, não um parecer jurídico. Uma mudança de termos,
licença, URL, layout ou mecanismo de autenticação invalida a decisão até nova
revisão.

## Decisões

Os estados usados nesta matriz são:

- `automate`: existe interface oficial de dados ou download estruturado,
  compatível com coleta automática e com licença identificada;
- `manual`: a fonte é útil, mas a evidência deve ser obtida ou confirmada por
  uma pessoa, sem robô de navegação;
- `blocked`: não deve ser integrada enquanto faltar licença, autorização,
  contrato ou interface oficial compatível.

| Fonte | Cobertura útil | Cadência oficial | Identificador principal | Decisão |
|---|---|---|---|---|
| Tesouro Transparente — preços e taxas do Tesouro Direto | Preço e taxa de compra e venda, PU-base, tipo e vencimento | Diária; divulgação no primeiro dia útil após o fechamento | Tipo do título + vencimento + data-base | `automate` |
| ANBIMA pública — mercado secundário | TPF, debêntures e histórico/negócios públicos conforme a publicação | Diária em dias úteis; horários variam por publicação | Código B3, código Selic ou ISIN, conforme o pacote | `manual` |
| ANBIMA Feed Preços & Índices | TPF, VNA, curvas, debêntures, CRI/CRA e REUNE | Diária ou intradiária, conforme o recurso | Código Selic, código B3 e ISIN | `blocked` |
| BCB SGS | Selic, CDI, IPCA e demais séries macro selecionadas | Conforme a periodicidade de cada série | Código SGS | `automate` |
| BCB Focus/Expectativas | Cenários agregados de inflação, Selic, câmbio e atividade | Estatísticas por data de observação; publicação oficial semanal | Indicador + data da observação + período de referência | `automate` |
| BCB IFData | Cadastro, conglomerados e dados contábeis selecionados de instituições | Trimestral, com defasagem oficial de 60 ou 90 dias | `CodInst`, conglomerado e data-base | `automate` |
| CVM — companhias abertas | Cadastro, DFP, ITR, fatos/eventos, escrituras e aditamentos de debêntures | Semanal para IPE; por entrega/ano nos demais conjuntos | CNPJ/código CVM + documento + data de entrega | `automate` |
| CVM — securitizadoras | Informes mensais e demonstrações de CRI e CRA | Arquivos anuais atualizados semanalmente | Securitizadora + emissão/série + período; ISIN quando informado | `automate` |
| FGC — regras de cobertura | Produtos cobertos, limites, exclusões e vigência normativa | Sem SLA de dados; muda por norma | Versão da norma + vigência | `manual` |
| FGC — associadas e conglomerados | Relação oficial de associadas agrupadas por conglomerado | Sem arquivo ou API pública identificada | Nome oficial exibido; não há ID estável publicado | `manual` |
| AUVP Capital pública | Posicionamento, serviços e existência de curadoria de renda fixa | Sem cadência de catálogo | Nenhum identificador de oferta | `blocked` para ofertas |
| BTG Pactual público | Materiais institucionais e de research; nenhum catálogo público de ofertas localizado | Sem cadência de catálogo | Nenhum identificador de oferta | `blocked` para ofertas |
| Exportação/comprovante BTG/AUVP fornecido pelo usuário | Oferta ou posição exatamente como observada pelo usuário | Na data e hora do artefato | ID externo presente no artefato ou chave composta local | `manual` |

## 1. Tesouro Direto e Tesouro Transparente

### Fonte e acesso

- Catálogo oficial: [Taxas dos Títulos Ofertados pelo Tesouro Direto](https://www.tesourotransparente.gov.br/ckan/dataset/taxas-dos-titulos-ofertados-pelo-tesouro-direto).
- Metadados por API CKAN:
  `GET https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show?id=taxas-dos-titulos-ofertados-pelo-tesouro-direto`.
- Recurso CSV oficial atual:
  `https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv`.
- [Metadados das colunas e metodologia](https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/1a8eb2e3-4902-4a38-a1eb-6410f23d90de/download/taxa.pdf).
- Página agregadora oficial: [Tesouro Direto — Tesouro Transparente](https://www.tesourotransparente.gov.br/temas/divida-publica-federal/tesouro-direto).

O `package_show` é o ponto de descoberta. O adapter deve selecionar o recurso
ativo por `format=CSV` e `resource id`, em vez de depender apenas do nome físico
do arquivo. O CSV traz tipo do título, vencimento, data-base, taxas de compra e
venda e PUs de compra, venda e base. O metadado define o PU-base como preço D0
para marcação a mercado e os PUs de compra/venda com liquidação D+1.

### Cobertura, atualidade e identificadores

O catálogo declara histórico desde janeiro de 2002 e frequência diária; o PDF
metodológico ainda menciona início em dezembro de 2004. Essa divergência deve
ser preservada como evidência: o adapter mede a menor data realmente presente
no CSV e não fixa uma cobertura histórica por texto. Os dados são publicados no
primeiro dia útil após o fechamento do mercado secundário e podem ser revistos.

O arquivo não oferece ISIN como chave. A observação bruta deve usar `type`,
`maturityDate` e `referenceDate`; a associação posterior a código Selic ou ISIN
exige uma segunda fonte oficial e não pode ser inferida apenas pelo nome.

Freshness inicial proposta: válido até o fim do próximo dia útil esperado. Uma
data-base anterior ao último fechamento esperado marca o snapshot como `stale`;
feriados precisam vir do calendário versionado, não de contagem de 24 horas.

### Licença e decisão

O conjunto declara **Open Data Commons ODbL** e o portal de dados abertos
informa livre utilização e distribuição com citação da fonte. Preservar URL,
data de consulta, data-base, licença, checksum do recurso e atribuição. Uma
eventual redistribuição pública da base normalizada deve passar por revisão das
obrigações da ODbL.

**Decisão: `automate`.** É a fonte primária do MVP para preços e taxas do
Tesouro Direto. Não é uma cotação intradiária nem prova de disponibilidade de
compra no BTG/AUVP.

## 2. ANBIMA pública e ANBIMA Feed

### Publicações públicas

- [Mercado Secundário de Debêntures — Taxas Médias](https://www.anbima.com.br/informacoes/merc-sec-debentures/default.asp).
- [Termos de Uso da ANBIMA](https://www.anbima.com.br/pt_br/termos-de-uso.htm).
- [REUNE — documentação oficial](https://developers.anbima.com.br/pt/documentacao/precos-indices/apis-de-precos/reune/).
- [Títulos Públicos — documentação oficial](https://developers.anbima.com.br/pt/documentacao/precos-indices/apis-de-precos/titulos-publicos/).
- [Feriados bancários — ANBIMA](https://www.anbima.com.br/feriados/).

A página pública de debêntures oferece XLS/TXT com taxas médias indicativas e
PUs para ativos atrelados a DI, IGP-M e IPCA, limitados aos últimos cinco dias
úteis na interface consultada. O ANBIMA Data permite consulta histórica em tela
e download para algumas publicações, inclusive REUNE. Código B3 e ISIN aparecem
em pacotes documentados e devem ser preferidos a nomes livres.

Os Termos de Uso vigentes proíbem aplicativos `spider`, mineração de dados e
outros acessos automatizados ao portal, além de restringirem reprodução e
distribuição das ferramentas de consulta. O fato de um TXT/XLS ser publicamente
baixável não equivale a permissão para coleta recorrente automatizada.

**Decisão: `manual`.** No MVP, uma pessoa pode baixar o arquivo público e
importá-lo com URL, data/hora, publicação, checksum e aviso de retificação. O
OpenAlice não deve montar URLs por padrão de nome nem automatizar a interface
ANBIMA Data. Retificações podem não gerar um novo arquivo; portanto, a captura
também precisa registrar e revisar a central oficial de avisos.

Revisão em 2026-08-21: a página pública de feriados oferece anos individuais e
uma planilha encadeada até 2099, com o critério de dias sem sensibilização das
Reservas Bancárias. Ela é a referência adequada para uma importação manual de
calendário, mas permanece sob a mesma decisão `manual`; o coletor shadow não
deve aproximar dias úteis por segunda a sexta nem automatizar o download sem
autorização compatível.

### Feed oficial

O [ANBIMA Feed Preços & Índices](https://developers.anbima.com.br/pt/documentacao/precos-indices/introducao-aos-pacotes/)
é REST/OAuth2 e documenta TPF, VNA, curvas, debêntures, CRI/CRA, REUNE e
índices. A documentação informa que o sandbox retorna dados fixos e fictícios e
que dados oficiais somente existem em produção. Também declara que os recursos
são privados e exigem credenciais.

Exemplos documentados incluem:

- `GET https://api.anbima.com.br/feed/precos-indices/v1/titulos-publicos/mercado-secundario-TPF`;
- `GET https://api.anbima.com.br/feed/precos-indices/v1/titulos-publicos/vna`;
- `GET https://api.anbima.com.br/feed/precos-indices/v1/titulos-publicos/curvas-juros`;
- `GET https://api.anbima.com.br/feed/precos-indices/v1/reune/negociacoes`.

As publicações de TPF e curvas são diárias, normalmente após as 20h; VNA é
diário, normalmente após as 10h. REUNE é diário em dias úteis e pode ser
intradiário. Essas cadências não concedem acesso.

**Decisão: `blocked`.** Não usar produção sem contratação/licença e autorização
de redistribuição compatíveis. Sandbox serve apenas a testes de contrato e nunca
como dado econômico. Uma futura contratação cria um novo source ID e não muda a
proveniência das importações públicas manuais.

## 3. Banco Central — SGS, Focus e IFData

Todos os conjuntos abaixo são publicados no [Portal de Dados Abertos do BCB](https://dadosabertos.bcb.gov.br/)
sob **ODbL**. Preservar atribuição, código/entidade consultada, filtros OData,
data-base, horário de coleta e payload bruto ou checksum.

### SGS

Formato oficial:

```text
GET https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados
    ?formato=json&dataInicial=DD/MM/AAAA&dataFinal=DD/MM/AAAA
```

Séries iniciais aprovadas, cada uma sujeita aos próprios metadados:

| Código SGS | Uso |
|---:|---|
| `12` | CDI diário |
| `432` | Meta Selic definida pelo Copom |
| `433` | IPCA, variação mensal |
| `1178` | Selic anualizada base 252 |

A página oficial da [série 432](https://dadosabertos.bcb.gov.br/dataset/432-taxa-de-juros---meta-selic-definida-pelo-copom)
confirma periodicidade diária, unidade `% a.a.` e o código SGS. Antes de ativar
cada outra série, congelar em fixture seu metadado oficial, unidade, frequência
e significado; igualdade de valor não torna duas séries semanticamente iguais.

Desde 26 de março de 2025, consultas JSON/CSV de séries diárias exigem filtros
e períodos de até dez anos. O coletor deve paginar por janelas menores, limitar
backfill e nunca requisitar todo o histórico diariamente.

Freshness deriva da periodicidade declarada: série diária vence no próximo dia
útil esperado; série mensal vence apenas após sua janela oficial. Ausência de
valor não pode ser preenchida por repetição silenciosa.

**Decisão: `automate`.** API oficial, sem autenticação, com filtros explícitos e
licença aberta.

### Focus / Expectativas de Mercado

- Catálogo: [Expectativas de Mercado](https://dadosabertos.bcb.gov.br/dataset/expectativas-mercado).
- Base OData:
  `https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/`.

Entidades úteis:

- `ExpectativasMercadoAnuais` para IPCA, Selic, câmbio e outros indicadores por
  ano de referência;
- `ExpectativasMercadoSelic` para reuniões do Copom;
- `ExpectativaMercadoMensais` e `ExpectativasMercadoTrimestrais` quando o
  horizonte exigir granularidade distinta.

As respostas incluem indicador, data de observação, data/período de referência,
média, mediana, dispersão, extremos, respondentes e base de cálculo. O catálogo
descreve estatísticas calculadas diariamente e publicação no primeiro dia útil
da semana. O contrato deve usar a data presente no registro, não o horário HTTP,
e classificar Focus como expectativa agregada, nunca taxa garantida.

Freshness inicial proposta: até a próxima publicação semanal esperada. Um
snapshot antigo pode continuar como cenário histórico, mas não como cenário
`current`.

**Decisão: `automate`.** Usar `$filter`, `$select`, `$orderby`, `$top` e
`$format=json`; guardar a URL canônica completa para reprodução.

### IFData

- Catálogo: [IFData — Dados selecionados de instituições financeiras](https://dadosabertos.bcb.gov.br/dataset/ifdata---dados-selecionados-de-instituies-financeiras).
- Base OData:
  `https://olinda.bcb.gov.br/olinda/servico/IFDATA/versao/v1/odata/`.
- Cadastro por data-base:
  `IfDataCadastro(AnoMes=@AnoMes)?@AnoMes=AAAAMM&$format=json`.
- Valores por data-base:
  `IfDataValores(AnoMes=@AnoMes,TipoInstituicao=@TipoInstituicao,Relatorio=@Relatorio)`
  com aliases OData e filtros explícitos.

`IfDataCadastro` fornece `CodInst`, nome, situação, CNPJ da líder e códigos de
conglomerado financeiro e prudencial. `IfDataValores` fornece relatório, conta,
coluna, descrição e saldo. Os códigos são chaves de junção dentro da mesma
data-base; não substituir CNPJ nem presumir estabilidade eterna.

O BCB publica os relatórios trimestrais 60 dias após março, junho e setembro e
90 dias após dezembro. Freshness deve seguir essa defasagem oficial: o último
trimestre disponível não é `stale` apenas por ter meses de idade. Registre a
data-base e a data de coleta separadamente.

**Decisão: `automate`.** É evidência de porte, balanço e conglomerado, mas não é
rating, probabilidade de default, prova de cobertura FGC nem dado diário.

## 4. CVM Dados Abertos

O [Portal Dados Abertos CVM](https://dados.cvm.gov.br/) publica recursos CKAN e
arquivos anuais estruturados sob **ODbL**. O coletor pode descobrir URLs pelo
`package_show` ou usar o repositório oficial de arquivos, sempre validando ano,
recurso ativo, tamanho, tipo e checksum antes de extrair.

### Companhias abertas e debêntures

- [IPE — periódicos e eventuais](https://dados.cvm.gov.br/dataset/cia_aberta-doc-ipe):
  escrituras e aditamentos de debêntures, avisos a debenturistas, fatos
  relevantes, documentos de oferta e recuperação judicial, entre outras
  categorias. Histórico desde 2003; ano corrente e A-1 atualizados semanalmente.
- Dicionário IPE:
  `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/META/meta_ipe_cia_aberta.txt`.
- IPE 2026:
  `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_2026.zip`.
- DFP 2026:
  `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_2026.zip`.
- ITR 2026:
  `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_2026.zip`.

IPE referencia documentos não estruturados; ele não transforma automaticamente
uma escritura em fato financeiro. O pipeline deve primeiro resolver companhia,
categoria, protocolo e URL oficial, depois baixar o documento com limites de
tamanho/tipo. Extração por modelo fica separada do fato original e exige página
ou trecho citado, confiança e revisão para covenants críticos.

### CRI e CRA

- [Informe Mensal de CRI](https://dados.cvm.gov.br/dataset/securit-doc-inf_mensal_cri),
  definido pelo Suplemento E da Resolução CVM 60, com arquivos anuais dos
  últimos cinco anos atualizados semanalmente.
- CRI 2026:
  `https://dados.cvm.gov.br/dados/SECURIT/DOC/INF_MENSAL_CRI/DADOS/inf_mensal_cri_2026.zip`.
- Dicionário CRI:
  `https://dados.cvm.gov.br/dados/SECURIT/DOC/INF_MENSAL_CRI/META/meta_inf_mensal_cri.zip`.
- Catálogo de [securitizadoras](https://dados.cvm.gov.br/dataset/?groups=securitizadoras),
  que inclui também Informe Mensal e Demonstrações Financeiras de CRA.
- CRA 2026:
  `https://dados.cvm.gov.br/dados/SECURIT/DOC/INF_MENSAL_CRA/DADOS/inf_mensal_cra_2026.zip`.
- Dicionário CRA:
  `https://dados.cvm.gov.br/dados/SECURIT/DOC/INF_MENSAL_CRA/META/meta_inf_mensal_cra.zip`.

Os nomes e chaves devem vir dos dicionários empacotados, não de suposição do
código. A chave normalizada deve conservar securitizadora, emissão/série,
período de competência e ISIN quando o informe o trouxer. Nem todo lastro,
garantia, waterfall ou evento crítico está disponível em campo estruturado.

Freshness: IPE e pacotes anuais vencem quando ultrapassarem a próxima
atualização semanal esperada; informes mensais também carregam competência e
não devem ser tratados como cotação atual. Reapresentação do mesmo período gera
nova versão/checksum, sem apagar a observação anterior.

**Decisão: `automate`.** Downloads oficiais e abertos são adequados a cadastro,
documentos e evidência financeira. Não fornecem preço secundário, liquidez ou
disponibilidade de oferta.

## 5. FGC

### Regras

- [Sobre a garantia do FGC](https://fgc.org.br/sobre-garantia-fgc).
- [Normas e Regulamento do FGC](https://www.fgc.org.br/pt/normas).
- [FAQ oficial](https://fgc.org.br/faq).

Na consulta, o FGC informava cobertura ordinária de até R$ 250 mil por CPF/CNPJ
por instituição ou conglomerado e teto de R$ 1 milhão em quatro anos. CDB, RDB,
LC, LCI e LCA constavam como cobertos; Tesouro Direto, debêntures, CRI e CRA
constavam como não cobertos. Esses números e produtos são fatos versionados por
vigência, não constantes de código.

### Associadas e conglomerados

A [lista oficial de instituições associadas e conglomerados](https://www.fgc.org.br/instituicoes-associadas-e-conglomerados)
é uma página interativa e declara refletir a última informação recebida da
entidade supervisora. Não foi localizado arquivo aberto, API pública, ID estável,
cadência ou licença de base de dados para essa lista.

**Decisão: `manual`.** Uma revisão humana versionada deve registrar URL,
consultado em, norma vigente, limite, produtos e mapeamento de conglomerado. A
regra só entra em cálculo depois de dupla conferência com o regulamento vigente.
Não automatizar HTML nem redistribuir a lista como base própria sem autorização.

Freshness inicial proposta: revisar mensalmente e imediatamente após nova norma,
intervenção/liquidação ou divergência com BCB/IFData. Divergência entre IFData e
FGC bloqueia a classificação de cobertura; IFData não substitui a lista do FGC.

## 6. AUVP Capital e BTG Pactual

### Material público encontrado

- [AUVP Capital](https://auvpcapital.com.br/) confirma plataforma e produtos de
  renda fixa, cashback e necessidade de verificar disponibilidade, mas não
  publica catálogo estruturado de ofertas, taxas, vencimentos, quantidade,
  validade ou identificadores.
- [Termos da AUVP Capital](https://auvpcapital.com.br/termos-de-uso/) descrevem
  o serviço consultivo, inclusive auxílio a aportes em renda fixa, sem criar uma
  licença ou interface pública de dados.
- Os [Termos da AUVP Escola](https://www.auvp.com.br/termos-de-uso/) destinam o
  conteúdo ao usuário e vedam compartilhamento, reprodução e exploração
  comercial sem autorização escrita.
- O portal público de [Research BTG Pactual](https://content.btgpactual.com/research/)
  apresenta materiais como pessoais/confidenciais e restringe reprodução e
  circulação sem autorização. Não foi localizada API pública oficial de
  inventário de renda fixa para varejo.

Páginas de marketing ou research não provam que um título esteja disponível,
nem os termos públicos permitem convertê-las em catálogo redistribuível. A
pesquisa não encontrou exportação pública oficial de ofertas AUVP/BTG.

**Decisão para descoberta automática: `blocked`.** Não autenticar, raspar ou
automatizar app, portal, área de aluno, relatório reservado, mensagem de
assessor ou endpoint observado por engenharia reversa. O OpenAlice também não
deve apresentar material público genérico como oferta indicativa.

**Decisão para artefato fornecido pelo usuário: `manual`.** Aceitar CSV, PDF ou
imagem exportada/fornecida licitamente pelo próprio usuário, sem armazenar
credenciais. O registro deve conter:

- origem declarada (`btg`, `auvp` ou ambas), nome do arquivo e checksum;
- data e hora da observação, fuso, conta/canal redigido e pessoa que confirmou;
- emissor, produto, indexador, taxa, vencimento, PU, mínimo, quantidade e
  validade somente quando presentes no artefato;
- identificador externo original; se ausente, chave local marcada como
  `non_authoritative`;
- `validUntil` explícito. Sem validade, a oferta é apenas `indicative` e nunca
  `manually_actionable`;
- confirmação separada e recente de disponibilidade. A confirmação não cria
  execução dentro do OpenAlice.

O adapter manual não deve republicar o artefato nem seu conteúdo para terceiros.
Redigir CPF, número de conta, assessor, saldo não necessário e qualquer token.

## 7. Política operacional aprovada

### Source IDs iniciais

```text
tesouro_transparente.td_price_rate.v1
anbima_public.manual_import.v1
bcb.sgs.v1
bcb.focus.v1
bcb.ifdata.v1
cvm.company_documents.v1
cvm.securitization_reports.v1
fgc.rules.manual_review.v1
fgc.membership.manual_review.v1
user_import.btg_auvp_offer.v1
```

`anbima_feed.*`, `auvp_private.*` e `btg_private.*` não podem ser source IDs de
produção enquanto estiverem `blocked`.

### Evidência mínima por snapshot

Todo snapshot deve registrar `sourceId`, URL canônica, método, parâmetros,
`observedAt`, `referenceDate`, `publishedAt` quando disponível, `validUntil`,
licença/termo versionado, checksum do payload bruto, parser/schema version,
identificadores originais, confiança e motivo de degradação.

Um snapshot é rejeitado quando:

- a fonte está `blocked` ou a licença/termo mudou sem revisão;
- falta data de referência em dado de mercado;
- o payload é HTML quando o contrato esperava CSV/JSON/ZIP;
- o checksum mudou para a mesma versão sem registro de reapresentação;
- identificadores conflitam entre fontes sem reconciliação explícita;
- a data excede a freshness da classe;
- uma importação manual não tem origem, horário ou checksum;
- uma oferta não tem confirmação recente e é tratada como disponível.

### Redistribuição

- Tesouro, BCB e CVM: conservar atribuição e metadados ODbL; revisar as
  obrigações da licença antes de qualquer exportação pública de base derivada.
- ANBIMA pública: uso interno somente por importação manual até autorização
  escrita ou licença específica; não automatizar nem redistribuir a publicação.
- ANBIMA Feed: aplicar o contrato comercial futuro, sem presumir direito de
  redistribuição.
- FGC: persistir regras/fatos necessários e links para a fonte; não espelhar a
  lista interativa sem autorização.
- AUVP/BTG: artefato do usuário é privado e não redistribuível; armazenar apenas
  os campos necessários, redigidos e vinculados ao usuário.

## Lacunas que permanecem abertas

1. Obter resposta escrita da ANBIMA sobre automação e redistribuição das
   publicações públicas ou contratar o Feed com direitos compatíveis.
2. Obter uma exportação oficial e redigida de ofertas/posições BTG/AUVP para
   congelar o schema de importação manual; não há fixture pública adequada.
3. Confirmar com AUVP/BTG se existe interface read-only documentada para o
   cliente e quais direitos de armazenamento e uso derivado ela concede.
4. Criar mapeamento oficial entre nomes do Tesouro Direto, código Selic e ISIN;
   o CSV do Tesouro Transparente não basta para essa junção.
5. Definir a fonte oficial sustentável para CDS/EMBI. Nenhuma fonte primária
   pública e gratuita foi aprovada nesta rodada.
6. Definir calendários e convenções por instrumento em fonte primária; a
   freshness proposta acima ainda depende desse calendário versionado.
7. Confirmar o identificador padronizado presente em uma exportação real
   AUVP/BTG. O material público não publica esse contrato.
8. Submeter as interpretações ODbL e de termos de uso à revisão jurídica antes
   de distribuir snapshots normalizados fora do ambiente local do usuário.

Até essas lacunas serem resolvidas, a matriz permite iniciar adapters de
Tesouro, BCB e CVM, importações manuais com proveniência e regras FGC revisadas
por pessoa. Ela não permite automatizar ANBIMA pública, AUVP ou BTG, nem declarar
uma oportunidade comercial como disponível.
