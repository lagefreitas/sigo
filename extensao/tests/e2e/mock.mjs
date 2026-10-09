// SIPAC falso, com a mesma estrutura de HTML mapeada, para testar a orquestração da extensão.
export const logado = { v: true };
const pagina = (corpo, extra = '') => `<!doctype html><html><head><meta charset="iso-8859-1"><title>SIPAC</title>${extra}</head><body>${corpo}</body></html>`;
const login = pagina(`<form name="usuarioForm"><input name="login"><input type="password" name="senha"></form>`);
const JSF = `<script>function jsfcljs(f,p,t){var q=new URLSearchParams(p);location.href='/sipac/protocolo/consulta/detalhe.jsf?'+q.toString();}</script>`;

export function rotear(url) {
  const u = new URL(url), p = u.pathname;
  if (p === '/sipac/logoff.jsf') { logado.v = false; return login; }
  if (!logado.v && !p.startsWith('/sipac/verArquivo')) return login;
  if (p === '/sipac/portal_administrativo/index.jsf')
    return pagina(`<div id="info-usuario"><p class="usuario"><span>MARIA DA SILVA TESTE</span></p></div>
      <a href="/sipac/logoff.jsf">Sair</a><table><tr onclick="location.href='/sipac/protocolo/consulta/consulta_processo.jsf'"><td>Consultar Processo</td></tr></table>`);
  if (p === '/sipac/protocolo/consulta/consulta_processo.jsf')
    return pagina(`<form id="processoForm" action="/sipac/protocolo/consulta/consulta_processo.jsf">
      <input type="radio" name="tipo" id="processoForm:byIdentificadores"><input type="radio" name="tipo" id="processoForm:byNomeInteressado">
      <input id="processoForm:radical"><input id="processoForm:numProtocolo"><input id="processoForm:ano"><input id="processoForm:dv">
      <input id="processoForm:interessadoNome">
      <input type="button" id="processoForm:b_buscar_processo" value="Buscar" onclick="
        var q=new URLSearchParams();['radical','numProtocolo','ano','dv','interessadoNome'].forEach(function(k){q.set(k,document.getElementById('processoForm:'+k).value)});
        location.href='/sipac/protocolo/consulta/resultado.jsf?'+q.toString()"></form>`);
  if (p === '/sipac/protocolo/consulta/resultado.jsf') {
    const nome = u.searchParams.get('interessadoNome');
    const num = u.searchParams.get('numProtocolo');
    if (num && num !== '029470') return pagina(`<form id="processoForm"></form><ul class="erros"><li>Nenhum processo encontrado.</li></ul>`, JSF);
    const linha = (n, id) => `<tr><td><img title="Processo Eletrônico"></td><td>MARIA DA SILVA TESTE</td><td>ICHCA</td><td>CPPD</td>
        <td><a id="processoForm:j_${id}:l_processo_detalhado" onclick="jsfcljs(document.getElementById('processoForm'),{'processoForm:j_${id}:l_processo_detalhado':'x','idProcesso':'${id}','popup':'true'},'popupWindow');return false" href="#">${n}</a></td></tr>
      <tr><td colspan="5">Origem: ICHCA Destino: CPPD (11.01) Situação: ATIVO Assunto do Processo: 023.12 - PROGRESSÃO OU PROMOÇÃO DE DOCENTE Assunto Detalhado: PROGRESSÃO FUNCIONAL ${id}</td></tr>`;
    const linhas = nome ? linha('23065.029470/2026-43', '111') + linha('23065.028072/2024-48', '222') : linha('23065.029470/2026-43', '111');
    return pagina(`<form id="processoForm" action="/sipac/x.jsf"><table id="processoForm:tabelaProcessos">${linhas}</table></form>`, JSF);
  }
  if (p === '/sipac/protocolo/consulta/detalhe.jsf' || p === '/sipac/protocolo/consulta/movs.jsf') {
    const movs = p.endsWith('movs.jsf');
    const geral = `<table class="formulario"><caption>Dados Gerais do Processo</caption>
      <tr><th>Processo:</th><td>23065.029470/2026-43</td></tr><tr><th>Assunto do Processo:</th><td>023.12 - PROGRESSÃO OU PROMOÇÃO DE DOCENTE</td></tr>
      <tr><th>Assunto Detalhado:</th><td>PROGRESSÃO FUNCIONAL 111</td></tr><tr><th>Natureza do Processo:</th><td>${u.searchParams.get('idProcesso') === '222' ? 'RESTRITO' : 'OSTENSIVO'}</td></tr>
      <tr><th>Status:</th><td>ATIVO</td></tr></table>
      <table class="subFormulario"><caption>Última Movimentação Realizada</caption><tr><th>Destino:</th><td>CPPD (11.01)</td></tr>
      <tr><th>Data de Envio:</th><td>01/09/2026</td></tr><tr><th>Data de Recebimento:</th><td>03/09/2026</td></tr></table>`;
    const abas = `<table><tr><td class="rich-tab-header">Documentos</td><td class="rich-tab-header" onclick="location.href='/sipac/protocolo/consulta/movs.jsf'">Movimentações</td></tr></table>`;
    const docs = `<table id="processoForm:documentosProcesso"><tbody>
      <tr><td><img title="Documento"></td><td>1</td><td>REQUERIMENTO</td><td>10/08/2026</td><td>ICHCA</td><td>OSTENSIVO</td><td><a onclick="window.open('/sipac/verArquivoDocumento?idArquivo=1&key=a&idDocumento=9')">ver</a></td></tr>
      <tr><td><img title="Documento Virtual Escrito"></td><td>2</td><td>DESPACHO</td><td>02/09/2026</td><td>CPPD</td><td>OSTENSIVO</td><td><a onclick="documentoDetalhado(77)">det</a></td></tr>
      <tr><td><img title="Documento"></td><td>3</td><td>PARECER</td><td>03/09/2026</td><td>CPPD</td><td>RESTRITO</td><td><a onclick="window.open('/sipac/verArquivoDocumento?idArquivo=3&key=c&idDocumento=11')">ver</a></td></tr>
    </tbody></table>`;
    const tabMovs = `<table id="processoForm:tableMovimentos"><tbody>
      <tr><td>1</td><td>ICHCA</td><td>10/08/2026</td><td><span title="JOAO - Ramal: 1234">JOAO</span></td><td>11/08/2026</td><td><span title="ANA - Ramal: 99">ANA</span></td><td>2</td><td>Não</td><td>Não</td></tr>
      <tr><td>2</td><td>CPPD (11.01)</td><td>01/09/2026</td><td><span title="ANA - Ramal: 99">ANA</span><span class="tooltip">ana@ufal.br Telefone: (82) 3214-0000</span></td><td>03/09/2026</td><td><span title="PEDRO - Ramal: 5">PEDRO</span></td><td>5</td><td>Não</td><td>Sim</td></tr>
    </tbody></table>`;
    return pagina(`<form id="processoForm">${geral}${abas}${movs ? tabMovs : docs}</form>`);
  }
  if (p === '/sipac/protocolo/documento/documento_visualizacao.jsf')
    return pagina(`<h1>DESPACHO</h1><p>Encaminho à CPPD para análise.</p>`);
  if (p === '/sipac/verArquivoDocumento') return '%PDF-1.4 falso';
  return pagina('404');
}
