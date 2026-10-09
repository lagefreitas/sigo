// Opera o SIPAC numa aba de trabalho, com a sessão que o próprio usuário abriu no Chrome.
// O Sigo nunca vê nem guarda a senha.
import * as pg from './pagina.js';
import { validarNumero } from './nup.js';

export const BASE = 'https://sipac.sig.ufal.br';
export const PORTAL = BASE + '/sipac/portal_administrativo/index.jsf';
export const LOGIN = BASE + '/sipac/';
export const PREFIXOS_ARQUIVO = [
  '/sipac/verArquivoDocumento?',                             // documento com arquivo anexado (PDF)
  '/sipac/protocolo/documento/documento_visualizacao.jsf?',  // documento escrito no SIPAC (HTML)
];
const MAX_ASSUNTOS = 80;
const OCIOSO_MS = 5 * 60 * 1000;  // fecha a aba de trabalho após 5 min sem uso

export class NaoLogado extends Error {
  constructor(msg = 'Sua sessão do SIPAC não está ativa. Entre no SIPAC e tente de novo.') { super(msg); this.login = true; }
}
export class ErroSipac extends Error {}

const sleep = ms => new Promise(r => setTimeout(r, ms));
export const usuario = { nome: '' };

// ------------------------------------------------------------------ aba de trabalho

let timerOcioso = null;

async function abaTrabalho() {
  const { abaSipac } = await chrome.storage.session.get('abaSipac');
  if (abaSipac) {
    try { const t = await chrome.tabs.get(abaSipac); if (t && !t.discarded) return t.id; } catch (e) { /* fechada */ }
  }
  const t = await chrome.tabs.create({ url: 'about:blank', active: false, index: 999 });
  await chrome.storage.session.set({ abaSipac: t.id });
  return t.id;
}

async function abaExistente() {
  const { abaSipac } = await chrome.storage.session.get('abaSipac');
  if (!abaSipac) return null;
  try { await chrome.tabs.get(abaSipac); return abaSipac; } catch (e) { return null; }
}

function agendarFechamento() {
  clearTimeout(timerOcioso);
  timerOcioso = setTimeout(async () => {
    const id = await abaExistente();
    if (id) { try { await chrome.tabs.remove(id); } catch (e) { /* já fechada */ } }
    await chrome.storage.session.remove('abaSipac');
  }, OCIOSO_MS);
}

/** Executa `disparar` e espera a aba terminar de carregar a próxima página. */
function esperarCarga(tabId, disparar, ms = 40000) {
  return new Promise((resolve, reject) => {
    let viuCarregando = false;
    const fim = setTimeout(() => { sair(); reject(new ErroSipac('O SIPAC demorou demais para responder. Tente de novo.')); }, ms);
    const ouvir = (id, info) => {
      if (id !== tabId) return;
      if (info.status === 'loading') viuCarregando = true;
      if (info.status === 'complete' && viuCarregando) { sair(); resolve(); }
    };
    const sair = () => { clearTimeout(fim); chrome.tabs.onUpdated.removeListener(ouvir); };
    chrome.tabs.onUpdated.addListener(ouvir);
    Promise.resolve().then(disparar).then(ok => {
      if (ok === false) { sair(); reject(new ErroSipac('Elemento não encontrado na tela do SIPAC (o SIPAC mudou?).')); }
    }).catch(e => { sair(); reject(e); });
  });
}

// As funções rodam no mundo isolado da extensão: a página não consegue adulterar fetch, DOMParser etc.
// Só pgAbrirDetalhe precisa do mundo da página, porque chama a função jsfcljs do próprio SIPAC.
const MUNDO_DA_PAGINA = new Set([pg.pgAbrirDetalhe]);
async function rodar(tabId, func, ...args) {
  const world = MUNDO_DA_PAGINA.has(func) ? 'MAIN' : 'ISOLATED';
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, world, func, args });
  return r ? r.result : undefined;
}

const navegar = (tabId, url) => esperarCarga(tabId, () => chrome.tabs.update(tabId, { url }));
const clicarENavegar = (tabId, func, ...args) => esperarCarga(tabId, () => rodar(tabId, func, ...args));

async function esperarSeletor(tabId, sel, ms = 10000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    try { if (await rodar(tabId, pg.pgExiste, sel)) return true; } catch (e) { /* página trocando */ }
    await sleep(300);
  }
  return false;
}

async function checarLogin(tabId) {
  const e = await rodar(tabId, pg.pgEstado);
  if (!e || e.senha || e.expirada) throw new NaoLogado();
}

/** O SIPAC guarda estado de tela no servidor: uma operação por vez, em todas as janelas do Sigo. */
async function exclusivo(fn) {
  return navigator.locks.request('sigo-sipac', async () => {
    clearTimeout(timerOcioso);
    try {
      const tabId = await abaTrabalho();
      return await fn(tabId);
    } finally {
      agendarFechamento();
    }
  });
}

// ------------------------------------------------------------------ sessão

/** Confere a sessão sem abrir aba nova quando possível. */
export async function status() {
  // Se uma consulta estiver em andamento, não interfere: devolve null (estado desconhecido).
  return navigator.locks.request('sigo-sipac', { ifAvailable: true }, async lock => {
    if (!lock) return null;
    const id = await abaExistente();
    let r = null;
    if (id) {
      try { r = await rodar(id, pg.pgChecarSessao, PORTAL); } catch (e) { r = null; }
    }
    if (!r) r = await pg.pgChecarSessao(PORTAL);  // da própria extensão (pode não levar o cookie em alguns perfis)
    if (r.nome) usuario.nome = r.nome;
    return { logado: r.logado, usuario: usuario.nome };
  });
}

/** Sai do SIPAC (encerra a sessão neste navegador) e fecha a aba de trabalho. */
export async function desconectar() {
  return navigator.locks.request('sigo-sipac', async () => {
    clearTimeout(timerOcioso);
    const tabId = await abaTrabalho();
    try {
      await navegar(tabId, PORTAL);
      const e = await rodar(tabId, pg.pgEstado);
      if (e && !e.senha && !e.expirada) {
        const sair = await rodar(tabId, pg.pgLinkSair);
        if (!sair) throw new ErroSipac('Não encontrei o botão "Sair" do SIPAC. Saia pela tela do próprio SIPAC.');
        if (!sair.startsWith(BASE + '/')) throw new ErroSipac('Link de saída inesperado. Saia pela tela do próprio SIPAC.');
        await navegar(tabId, sair);
        const depois = await pgCheca(tabId);
        if (depois) throw new ErroSipac('O SIPAC não encerrou a sessão. Saia pela tela do próprio SIPAC.');
      }
    } finally {
      usuario.nome = '';
      try { await chrome.tabs.remove(tabId); } catch (err) { /* já fechada */ }
      await chrome.storage.session.remove('abaSipac');
    }
  });
}
async function pgCheca(tabId) {
  const r = await rodar(tabId, pg.pgChecarSessao, PORTAL).catch(() => null);
  return !!(r && r.logado);
}

export async function abrirLogin() {
  await chrome.tabs.create({ url: LOGIN, active: true });
}

// ------------------------------------------------------------------ consultas

async function abrirConsulta(tabId) {
  await navegar(tabId, PORTAL);
  await checarLogin(tabId);
  if (!usuario.nome) { try { usuario.nome = await rodar(tabId, pg.pgUsuario) || ''; } catch (e) { /* opcional */ } }
  await clicarENavegar(tabId, pg.pgAbrirConsulta);
  await checarLogin(tabId);
  if (!await esperarSeletor(tabId, '[id="processoForm:b_buscar_processo"]'))
    throw new ErroSipac('A tela "Consultar Processo" não abriu (o SIPAC mudou?).');
}

async function buscarNaAba(tabId, { numero, interessado }) {
  await abrirConsulta(tabId);
  let ok;
  if (numero) {
    const p = validarNumero(numero);
    ok = await rodar(tabId, pg.pgPreencher, 'processoForm:byIdentificadores', {
      'processoForm:radical': p.radical, 'processoForm:numProtocolo': p.numero,
      'processoForm:ano': p.ano, 'processoForm:dv': p.dv,
    });
  } else {
    ok = await rodar(tabId, pg.pgPreencher, 'processoForm:byNomeInteressado', {
      'processoForm:interessadoNome': interessado.trim().toUpperCase(),
    });
  }
  if (!ok) throw new ErroSipac('Não consegui preencher o formulário de consulta (o SIPAC mudou?).');
  await clicarENavegar(tabId, pg.pgClicar, 'processoForm:b_buscar_processo');
  await checarLogin(tabId);
  return { resultados: await rodar(tabId, pg.pgResultados), mensagens: await rodar(tabId, pg.pgMensagens) };
}

const semAcento = t => t.normalize('NFD').replace(/\p{M}/gu, '');
const variantesNome = nome => {
  const n = nome.split(/\s+/).filter(Boolean).join(' ').toUpperCase();
  return [...new Set([n, semAcento(n)])];
};

/**
 * Busca por nome do interessado. O SIPAC compara o nome como foi cadastrado,
 * então buscamos com e sem acento e juntamos. `cache` = assuntos já conhecidos (nº -> {assunto, detalhado, autuacao}).
 */
export async function buscarPorNome(nome, cache = {}) {
  return exclusivo(async tabId => {
    const res = [], msgs = [], vistos = new Set();
    for (const v of variantesNome(nome)) {
      const { resultados, mensagens } = await buscarNaAba(tabId, { interessado: v });
      msgs.push(...mensagens);
      const faltam = resultados
        .filter(r => !cache[r.numero] && !vistos.has(r.numero) && !r.detalhado && r.idProcesso)
        .slice(0, MAX_ASSUNTOS)
        .map(r => ({ numero: r.numero, linkId: r.linkId, idProcesso: r.idProcesso }));
      let info = {};
      if (faltam.length) { try { info = await rodar(tabId, pg.pgAssuntos, faltam, 4, 25000) || {}; } catch (e) { info = {}; } }
      for (const r of resultados) {
        Object.assign(r, info[r.numero] || {});
        for (const [k, val] of Object.entries(cache[r.numero] || {})) if (!r[k]) r[k] = val;
        if (!vistos.has(r.numero)) { vistos.add(r.numero); res.push(r); }
      }
    }
    return { resultados: res, mensagens: res.length ? [] : [...new Set(msgs)] };
  });
}

/** Abre o processo pelo número e lê dados gerais, documentos e movimentações. */
export async function detalhar(numero) {
  validarNumero(numero);
  return exclusivo(async tabId => {
    const { resultados, mensagens } = await buscarNaAba(tabId, { numero });
    if (!resultados.length) throw new ErroSipac(mensagens.join('; ') || 'Processo não encontrado.');
    const r = resultados[0];
    const params = { [r.linkId]: r.linkId, idProcesso: r.idProcesso, popup: 'true' };
    await clicarENavegar(tabId, pg.pgAbrirDetalhe, params);
    await checarLogin(tabId);
    if (!await esperarSeletor(tabId, 'table.formulario caption', 15000))
      throw new ErroSipac('A ficha do processo não abriu (o SIPAC mudou?).');

    const geral = await rodar(tabId, pg.pgDadosGerais);
    const documentos = await esperarSeletor(tabId, '[id="processoForm:documentosProcesso"]', 8000)
      ? await rodar(tabId, pg.pgDocumentos) : [];

    let movimentacoes = [];
    if (await rodar(tabId, pg.pgAba, 'Movimentações')) {
      if (await esperarSeletor(tabId, '[id="processoForm:tableMovimentos"]', 12000)) {
        await sleep(200);
        try { movimentacoes = await rodar(tabId, pg.pgMovimentos); } catch (e) { movimentacoes = []; }
      }
    }
    return {
      numero: r.numero, idProcesso: r.idProcesso, situacao: r.situacao,
      interessados: r.interessados || '', localAtual: r.localAtual,
      ...geral, documentos, movimentacoes,
    };
  });
}

/** Baixa documentos pela sessão logada (para a IA). Retorna {itens, log}. */
export async function baixarDocumentos(docs, { maxDocs = 6, maxPdf = 7 * 1024 * 1024, maxTotal = 15 * 1024 * 1024, aceitar = () => true } = {}) {
  return exclusivo(async tabId => {
    const ordem = d => parseInt(d.ordem, 10) || 0;
    const escolhidos = [...docs].sort((a, b) => ordem(a) - ordem(b)).slice(-maxDocs);
    const itens = [], log = [];
    let total = 0, preparado = false;
    for (const d of escolhidos) {
      const rot = `doc. ${d.ordem} - ${d.tipo} (${d.data})`;
      if (!aceitar(d)) { log.push(`${rot}: não enviado (documento restrito/sigiloso)`); continue; }
      if (d.acessoNegado || !d.url || !PREFIXOS_ARQUIVO.some(p => d.url.startsWith(p))) { log.push(`${rot}: sem acesso`); continue; }
      if (!preparado) {  // a aba precisa estar numa página do SIPAC para o fetch levar a sessão
        const e = await rodar(tabId, pg.pgEstado).catch(() => null);
        if (!e || !e.url.startsWith(BASE)) await navegar(tabId, PORTAL);
        preparado = true;
      }
      let r;
      try { r = await rodar(tabId, pg.pgBaixar, BASE + d.url, Math.min(maxPdf, maxTotal - total)); }
      catch (e) { log.push(`${rot}: falha ao baixar`); continue; }
      if (r.tipo === 'login') throw new NaoLogado();
      if (r.tipo === 'html') { itens.push({ rotulo: rot, texto: r.texto }); log.push(`${rot}: lido`); }
      else if (r.tipo === 'pdf') { total += r.bytes; itens.push({ rotulo: rot, pdf: r.base64 }); log.push(`${rot}: lido (PDF)`); }
      else if (r.tipo === 'grande') log.push(`${rot}: PDF grande demais, ignorado`);
      else log.push(`${rot}: formato ${r.mime || 'desconhecido'} ignorado`);
    }
    return { itens, log };
  });
}

export async function abrirDocumento(url) {
  if (!PREFIXOS_ARQUIVO.some(p => (url || '').startsWith(p))) throw new ErroSipac('Endereço de documento não permitido.');
  await chrome.tabs.create({ url: BASE + url, active: true });
}
