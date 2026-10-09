# Mapeamento SIPAC/UFAL — Consulta de Processo (01/10/2026, SIPAC v5.9.1)

- Base: https://sipac.sig.ufal.br (não é sipac.ufal.br). Portal: /sipac/portal_administrativo/index.jsf
- Menu JSCookMenu: item "Consultar Processo" → `#{consultaProcessoMBean.entrarConsultadorProcessos}`. Abrir disparando mouseover/mousedown/mouseup/click no `tr` do `td` com o texto.
- Form `processoForm` (action /sipac/protocolo/consulta/consulta_processo.jsf):
  - Por número: marcar `processoForm:byIdentificadores`; campos `radical` (23065), `numProtocolo`, `ano`, `dv`.
  - Por nome do interessado: `byNomeInteressado` + `interessadoNome` (texto livre). `interessado` é autocomplete.
  - Botão `processoForm:b_buscar_processo`.
- Resultados: `processoForm:tabelaProcessos`; link `a[id$=":l_processo_detalhado"]` com onclick `jsfcljs(form,{linkId,idProcesso,popup:'true'},'popupWindow')`. Com target '' abre na mesma aba. A linha seguinte traz Origem/Destino/Situação da última movimentação.
- Detalhe: `table.formulario` caption "Dados Gerais do Processo" (th.rotulo/td); `table.subFormulario` "Última Movimentação Realizada".
  - Abas RichFaces `td.rich-tab-header` (Documentos, Interessados, Arquivos Anexados, Movimentações, ...). Só a aba ativa fica no DOM.
  - Documentos: `processoForm:documentosProcesso` (linhas com ≥7 células; link `/sipac/verArquivoDocumento?idArquivo=..&key=..&idDocumento=..`).
  - Movimentações: `processoForm:tableMovimentos` (linhas com ≥9 células; nome do remetente no `span[title]`).
- Documentos escritos no SIPAC (ícone "Documento Virtual Escrito") não têm arquivo. A versão de impressão abre direto em
  `/sipac/protocolo/documento/documento_visualizacao.jsf?imprimir=true&idDoc=<idDocumento>` (HTML ISO-8859-1), com a sessão logada.
  O `idDocumento` vem de `documentoDetalhado(<id>)` na mesma linha.
- Nº de processo = NUP: `RRRRR.NNNNNN/AAAA-DD`. Radical da UFAL = 23065. DV: módulo 11 sobre os 15 dígitos, pesos decrescentes de 16 a 2; o 2º DV repete o cálculo incluindo o 1º (pesos 17..2); resto 10→0, 11→1. Validado em 23065.029470/2026-43 e 23065.028072/2024-48. O Sigo rejeita números inválidos antes de consultar o SIPAC.
- Lista de resultados: abaixo de cada processo (linhas seguintes até o próximo link `l_processo_detalhado`) vêm a "Última Movimentação" (Origem/Destino/Situação), "Assunto do Processo" e "Assunto Detalhado" ("---" quando vazio) e "Documentos do Processo". O Sigo lê o assunto daí; só abre a ficha (POST do link) quando ele vem vazio.
