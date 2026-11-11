import * as sipac from './lib/sipac.js';
import { pareceNumero, erroNumero, limpar } from './lib/nup.js';
import { ondeEsta, assinatura, foto, mudancas, iaCurta, processoRestrito, naturezaDesconhecida, ehRestrito, agora } from './lib/processo.js';
import * as ia from './lib/ia.js';
import { S, carregar, salvar, termosAceitos, iaPronta, TERMOS_HTML, VERSAO_TERMOS, agoraISO } from './lib/config.js';

// ===================================================================== utilidades
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sessao = {
  get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem espaço */ } },
};
const sigla = u => (u || '').replace(/\s*\([\d.]+\)\s*$/, '').trim();
const MINUSC = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'para', 'por', 'a', 'o', 'em', 'no', 'na', 'nos', 'nas', 'ao', 'à']);
const SIGLAS = /^(UFAL|ICHCA|CPPD|DAP|CNOR|CPAG|PROGEP|CRP|SIAPE|TRD|NTI|PROPEP|PROGRAD|PROEX|RP|PROGINST|PROPLAG|PROEST|CGU|TCU)$/;
const titulo = s => (s || '').toLowerCase().split(/(\s+|\/|-|\()/).map((w, i) => {
  if (!w || /^\s+$|^[/(-]$/.test(w)) return w;
  if (SIGLAS.test(w.toUpperCase()) || /^(i{1,3}|iv|vi{0,3}|ix|x{1,3})\.?$/.test(w)) return w.toUpperCase();
  if (i > 0 && MINUSC.has(w)) return w;
  return w.charAt(0).toUpperCase() + w.slice(1);
}).join('');
const dias = n => n == null ? '—' : n + (n === 1 ? ' dia' : ' dias');
const ICO = {
  seta: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--faint)"><path d="m9 6 6 6-6 6"/></svg>',
  voltar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>',
  mail: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  atualizar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 4v5h-5"/></svg>',
  estrela: c => `<svg width="16" height="16" viewBox="0 0 24 24" fill="${c ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>`,
  abrir: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--faint)"><path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>',
  check: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>',
  ia: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2"/><circle cx="12" cy="12" r="3"/></svg>',
  cadeado: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
};
const favoritos = () => S.favoritos || {};
const ehFav = n => !!favoritos()[n];

/** Aviso de erro; se a sessão caiu, oferece entrar no SIPAC e tentar de novo. */
let repetir = null;
function erroHTML(e, acao) {
  repetir = acao || null;
  if (e && e.login) {
    marcarStatus(false);
    return `<div class="aviso atencao"><b>Sua sessão do SIPAC não está ativa.</b><br>Entre no SIPAC nesta janela do Chrome e depois tente de novo.
      <div class="acoes"><button class="btn pri" data-login>Entrar no SIPAC</button>${acao ? '<button class="btn" data-repetir>Tentar de novo</button>' : ''}</div></div>`;
  }
  return `<div class="aviso erro">${esc(e && e.message || e)}${acao ? '<div class="acoes"><button class="btn" data-repetir>Tentar de novo</button></div>' : ''}</div>`;
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-login]')) sipac.abrirLogin();
  else if (e.target.closest('[data-repetir]') && repetir) repetir();
});

// ===================================================================== sessão SIPAC
function marcarStatus(on, nome) {
  $('#pt').className = 'pt ' + (on ? 'on' : 'off');
  $('#st').innerHTML = on
    ? (nome ? `<b>${esc(titulo(nome))}</b> · SIPAC conectado` : 'SIPAC conectado')
    : 'Sessão do SIPAC não confirmada';
  $('#btnLogin').hidden = on;
  $('#btnSair').hidden = !on;
}
async function checar() {
  try { const s = await sipac.status(); if (s) marcarStatus(s.logado, s.usuario); } catch (e) { marcarStatus(false); }
}
$('#btnLogin').onclick = () => sipac.abrirLogin();
$('#btnSair').onclick = () => {
  abrirModal(`<h2>Desconectar do SIPAC?</h2>
    <p>O Sigo vai sair do SIPAC. Isso encerra a sua sessão do SIPAC em todo este navegador, inclusive nas abas do SIPAC que estiverem abertas.</p>
    <p class="cinza peq">Seus processos acompanhados e configurações continuam salvos.</p>
    <div class="acoes"><button class="btn" id="btnNaoSair">Cancelar</button><button class="btn pri" id="btnSimSair">Desconectar</button></div>`);
  $('#btnNaoSair').onclick = fecharModal;
  $('#btnSimSair').onclick = async () => {
    fecharModal();
    $('#st').textContent = 'Desconectando…'; $('#btnSair').hidden = true;
    try { await sipac.desconectar(); marcarStatus(false); $('#st').textContent = 'Desconectado do SIPAC'; }
    catch (e) { await checar(); $('#st').textContent = e.message; }
  };
};
window.addEventListener('focus', () => checar());

// ===================================================================== navegação
let vista = 'acomp', origemProc = null;
function mostrar(v) {
  vista = v;
  $('#vAcomp').hidden = v !== 'acomp'; $('#vBuscar').hidden = v !== 'buscar'; $('#vProc').hidden = v !== 'proc';
  const aba = v === 'proc' ? (origemProc === 'acomp' ? 'acomp' : 'buscar') : v;
  document.querySelectorAll('nav.vistas button').forEach(b => b.classList.toggle('on', b.dataset.v === aba));
}
document.querySelectorAll('nav.vistas button').forEach(b => b.onclick = () => {
  if (b.dataset.v === 'acomp') { mostrar('acomp'); renderAcomp(); verificarPendentes(); }
  else { mostrar('buscar'); setTimeout(() => $('#q').focus(), 0); }
});
$('#btnConfig').onclick = () => chrome.runtime.openOptionsPage();
$('#btnAba').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('painel.html') });
chrome.tabs.getCurrent().then(t => { if (t) $('#btnAba').hidden = true; }).catch(() => {});

// ===================================================================== Buscar
let ultimaBusca = sessao.get('ultimaBusca');
function lembrar(q) {
  const r = (S.recentes || []).filter(x => x !== q); r.unshift(q);
  salvar('recentes', r.slice(0, 6)); recentes();
}
function recentes() {
  const r = S.recentes || [];
  $('#recentes').innerHTML = r.length ? '<span class="cinza peq">Recentes</span>' + r.map(q => `<span class="recente"><button class="chip ${pareceNumero(q) ? 'mono' : ''}" data-q="${esc(q)}">${esc(q)}</button><button class="rm" data-rm="${esc(q)}" title="Remover dos recentes" aria-label="Remover ${esc(q)} dos recentes">×</button></span>`).join('') : '';
}
function esquecer(q) { salvar('recentes', (S.recentes || []).filter(x => x !== q)); recentes(); }
$('#recentes').onclick = e => {
  const rm = e.target.closest('[data-rm]'); if (rm) return esquecer(rm.dataset.rm);
  const q = e.target.dataset.q; if (q) { $('#q').value = q; executar(q); }
};
$('#form').onsubmit = e => { e.preventDefault(); const q = limpar($('#q').value); if (q) executar(q); };
$('#q').addEventListener('input', () => $('#campo').classList.remove('inval'));
function executar(q) {
  if (pareceNumero(q)) {
    const p = erroNumero(q);
    if (p) { $('#campo').classList.add('inval'); $('#saida').innerHTML = `<div class="aviso erro">${esc(p)}</div>`; return; }
    lembrar(q); return abrir(q, null);
  }
  if (q.length < 3) { $('#saida').innerHTML = '<div class="aviso">Digite ao menos 3 letras do nome.</div>'; return; }
  lembrar(q); listar(q);
}
async function listar(nome) {
  $('#saida').innerHTML = '<div class="carregando">Consultando o SIPAC…</div>'; $('#btnBuscar').disabled = true;
  try {
    const cache = S.assuntos || {};
    const { resultados, mensagens } = await sipac.buscarPorNome(nome, cache);
    for (const x of resultados) {
      if (x.assunto || x.detalhado) {
        const antigo = cache[x.numero] || {};
        cache[x.numero] = Object.fromEntries(['assunto', 'detalhado', 'autuacao'].map(k => [k, x[k] || antigo[k] || '']));
      }
    }
    salvar('assuntos', cache);
    marcarStatus(true, sipac.usuario.nome);
    ultimaBusca = { q: nome, resultados, mensagens, scroll: 0, em: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) };
    sessao.set('ultimaBusca', ultimaBusca); mostrarLista();
  } catch (e) { $('#saida').innerHTML = erroHTML(e, () => listar(nome)); }
  finally { $('#btnBuscar').disabled = false; }
}
function pillSituacao(s) {
  s = s || '';
  if (/RECEBER/.test(s)) return '<span class="pill p-amber">A receber</span>';
  if (/ARQUIVADO/.test(s)) return '<span class="pill p-green">Arquivado</span>';
  if (/APENSADO/.test(s)) return '<span class="pill p-neutro">Apensado</span>';
  if (/ANEXADO/.test(s)) return '<span class="pill p-neutro">Anexado</span>';
  if (/CANCELADO/.test(s)) return '<span class="pill p-neutro">Cancelado</span>';
  return s ? `<span class="pill p-neutro">${esc(titulo(s.split(' - ')[0]))}</span>` : '';
}
const tema = a => { const t = (a || '').replace(/^[\d.]+\s*-\s*/, '').toLowerCase(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; };
const semAcento = t => (t || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
function linhaRes(r) {
  const ass = r.detalhado && r.detalhado !== '---' ? r.detalhado : '';
  const fav = ehFav(r.numero) ? ' <span style="color:var(--accent)" title="Acompanhando">★</span>' : '';
  return `<button class="res" data-n="${esc(r.numero)}" data-busca="${esc(semAcento([r.numero, r.detalhado, r.assunto, r.interessados, r.ultimoDestino].join(' ')))}">
    <span class="t">
      ${ass ? `<span class="ass">${esc(titulo(ass))}${fav}</span>` : `<span class="ass mono" style="font-size:14px">${esc(r.numero)}${fav}</span>`}
      ${r.assunto ? `<span class="tema" title="${esc(r.assunto)}">${esc(tema(r.assunto))}</span>` : ''}
      <span class="meta">${ass ? `<span class="mono">${esc(r.numero)}</span>` : ''}${r.autuacao ? `<span>autuado em ${esc(r.autuacao)}</span>` : ''}<span>${esc(titulo(r.interessados))}</span></span>
      <span class="rota">${esc(titulo(sigla(r.ultimaOrigem)))} → <b>${esc(titulo(sigla(r.ultimoDestino)))}</b></span>
    </span>
    ${pillSituacao(r.situacao)}</button>`;
}
function mostrarLista() {
  if (!ultimaBusca) return;
  const { q, resultados, mensagens, em } = ultimaBusca;
  $('#q').value = q;
  if (!resultados.length) { $('#saida').innerHTML = `<div class="aviso">${esc((mensagens || []).join(' ') || 'Nenhum processo encontrado.')}</div>`; return; }
  const n = resultados.length;
  $('#saida').innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
      <span><b id="nRes">${n} processo${n > 1 ? 's' : ''}</b> para “${esc(q)}” <span class="cinza peq">· ${esc(em || '')}</span></span>
      ${n > 6 ? `<label class="filtro"><span class="sr">Filtrar resultados</span><input id="filtroRes" placeholder="Filtrar por assunto ou número" value="${esc(ultimaBusca.filtro || '')}"></label>` : ''}
    </div>
    <div class="cartao lista" id="listaRes">${resultados.map(linhaRes).join('')}</div>
    <div class="aviso" id="semFiltro" hidden>Nenhum processo com esse filtro.</div>`;
  const f = $('#filtroRes');
  if (f) { f.oninput = () => filtrar(f.value); if (f.value) filtrar(f.value); }
}
function filtrar(v) {
  ultimaBusca.filtro = v; sessao.set('ultimaBusca', ultimaBusca);
  const termos = semAcento(v).split(/\s+/).filter(Boolean);
  let vis = 0;
  document.querySelectorAll('#listaRes .res').forEach(b => { const ok = termos.every(t => b.dataset.busca.includes(t)); b.hidden = !ok; if (ok) vis++; });
  const n = ultimaBusca.resultados.length;
  $('#nRes').textContent = termos.length ? `${vis} de ${n} processos` : `${n} processo${n > 1 ? 's' : ''}`;
  $('#listaRes').hidden = !vis; $('#semFiltro').hidden = !!vis;
}
$('#saida').addEventListener('click', e => {
  const b = e.target.closest('.res'); if (!b) return;
  ultimaBusca.scroll = window.scrollY; sessao.set('ultimaBusca', ultimaBusca); abrir(b.dataset.n, 'busca');
});

// ===================================================================== Processo
let procAtual = null;

function guardarAssunto(proc) {
  const d = proc.dados || {};
  if (d['Assunto do Processo'] || d['Assunto Detalhado']) {
    const c = S.assuntos || {};
    c[proc.numero] = { assunto: d['Assunto do Processo'] || '', detalhado: d['Assunto Detalhado'] || '', autuacao: d['Data de Autuação'] || '' };
    salvar('assuntos', c);
  }
}
function resumoGuardado(proc) {
  const c = (S.resumos || {})[proc.numero];
  return c && c.assinatura === assinatura(proc) ? c.resumo : null;
}

async function abrir(numero, origem, opcoes) {
  origemProc = origem; mostrar('proc'); window.scrollTo(0, 0);
  $('#vProc').innerHTML = barraVoltar() + '<div class="carregando">Abrindo o processo no SIPAC…</div>';
  try {
    const p = await sipac.detalhar(numero);
    marcarStatus(true, sipac.usuario.nome);
    p.ondeEsta = ondeEsta(p);
    guardarAssunto(p);
    const r = resumoGuardado(p);
    if (r) p.resumoIA = r;
    procAtual = p; renderProc(p);
    if (opcoes && opcoes.mensagem) {
      if (p.resumoIA && p.resumoIA.mensagem) $('#secMsg').scrollIntoView({ behavior: 'smooth', block: 'start' });
      else if (iaPronta()) resumir(p, false, true);
    }
  } catch (e) { $('#vProc').innerHTML = barraVoltar() + erroHTML(e, () => abrir(numero, origem, opcoes)); }
}
function barraVoltar() {
  if (origemProc === 'busca' && ultimaBusca) return `<button class="voltar" data-voltar="busca">${ICO.voltar} Voltar para os ${ultimaBusca.resultados.length} resultados</button>`;
  if (origemProc === 'acomp') return `<button class="voltar" data-voltar="acomp">${ICO.voltar} Voltar para Acompanhar</button>`;
  return `<button class="voltar" data-voltar="buscar">${ICO.voltar} Voltar para a busca</button>`;
}
$('#vProc').addEventListener('click', e => {
  const v = e.target.closest('[data-voltar]');
  if (v) {
    if (v.dataset.voltar === 'acomp') { mostrar('acomp'); renderAcomp(); }
    else { mostrar('buscar'); if (v.dataset.voltar === 'busca') { mostrarLista(); requestAnimationFrame(() => window.scrollTo(0, ultimaBusca.scroll || 0)); } }
    return;
  }
  const d = e.target.closest('[data-doc]');
  if (d) sipac.abrirDocumento(d.dataset.doc).catch(err => alertaBreve(err.message));
});
function alertaBreve(msg) {
  const a = document.createElement('div');
  a.className = 'aviso erro'; a.textContent = msg;
  $('#vProc').prepend(a); setTimeout(() => a.remove(), 5000);
}
function tagsProc(p) {
  const o = p.ondeEsta || {}, t = [];
  if (o.parado) t.push(`<span class="pill p-red"><i></i>Parado há ${o.diasNaUnidade} dias</span>`);
  else if (o.unidade && !o.recebido) t.push('<span class="pill p-amber"><i></i>Aguardando recebimento</span>');
  const s = o.situacao || p.situacao || '';
  if (s && !/^ATIVO/.test(s)) t.push(`<span class="pill p-neutro">${esc(titulo(s.split(' - ')[0]))}</span>`);
  if (processoRestrito(p) && !naturezaDesconhecida(p)) t.push(`<span class="pill p-neutro">${ICO.cadeado} Acesso restrito</span>`);
  return t.join('');
}
function renderProc(p) {
  const d = p.dados || {}, fav = ehFav(p.numero);
  const ass = d['Assunto Detalhado'] || d['Assunto do Processo'] || '';
  const r = p.resumoIA;
  $('#vProc').innerHTML = `${barraVoltar()}
    <section class="ptopo">
      <div style="display:flex;flex-direction:column;gap:8px;min-width:0">
        <span class="mono cinza" style="font-size:13px">${esc(p.numero)}</span>
        <h1>${esc(titulo(ass))}</h1>
        <div class="tags">${tagsProc(p)}</div>
      </div>
      <div class="dir">
        <button class="btn ${fav ? 'suave' : ''}" id="btnFav" aria-pressed="${fav}">${ICO.estrela(fav)} ${fav ? 'Acompanhando' : 'Acompanhar'}</button>
        <button class="btn" id="btnAtualizar">${ICO.atualizar} Atualizar</button>
      </div>
    </section>
    <section class="cartao" id="secIA">${r ? iaHTML(r, p) : ctaIA(p)}</section>
    <section class="cartao msg" id="secMsg" ${r && r.mensagem && r.mensagem.texto ? '' : 'hidden'}>${r ? msgHTML(r.mensagem) : ''}</section>
    <section class="cartao" style="overflow:hidden">
      <div class="abas" role="tablist">
        <button class="aba on" role="tab" data-a="docs">Documentos<span>${p.documentos.length}</span></button>
        <button class="aba" role="tab" data-a="movs">Movimentações<span>${p.movimentacoes.length}</span></button>
        <button class="aba" role="tab" data-a="dados">Dados gerais</button>
      </div>
      <div data-p="docs">${docsHTML(p)}</div>
      <div data-p="movs" hidden>${movsHTML(p)}</div>
      <div data-p="dados" hidden><dl class="dados">${Object.entries(d).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>
    </section>`;
  document.querySelectorAll('#vProc .aba').forEach(b => b.onclick = () => {
    document.querySelectorAll('#vProc .aba').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('#vProc [data-p]').forEach(x => x.hidden = x.dataset.p !== b.dataset.a);
  });
  $('#btnAtualizar').onclick = () => abrir(p.numero, origemProc);
  $('#btnFav').onclick = () => {
    const f = { ...favoritos() };
    if (f[p.numero]) delete f[p.numero]; else f[p.numero] = ass;
    salvar('favoritos', f); renderProc(p);
    if (f[p.numero] && !p.resumoIA && iaPronta() && podeUsarIA(p)) resumir(p);
  };
  ligarIA(p);
}
function docsHTML(p) {
  if (!p.documentos.length) return '<div class="vazio">Nenhum documento.</div>';
  const docs = [...p.documentos].sort((a, b) => (+b.ordem || 0) - (+a.ordem || 0));
  return docs.map(x => {
    const sub = [titulo(sigla(x.origem)), x.escrito ? 'escrito no SIPAC' : (x.url ? 'arquivo anexado' : ''),
      x.acessoNegado ? 'acesso negado pelo SIPAC' : '', ehRestrito(x.natureza) ? titulo(x.natureza) : '']
      .filter(Boolean).join(' · ');
    const inner = `<span class="mono cinza" style="font-size:12.5px">${esc(x.ordem)}</span>
      <span class="t"><b>${esc(titulo(x.tipo))}</b><span>${esc(sub)}</span><span>${esc(x.data)}</span></span>`;
    return x.url && !x.acessoNegado
      ? `<button class="doc" data-doc="${esc(x.url)}" title="Abrir no SIPAC">${inner}${ICO.abrir}</button>`
      : `<div class="doc" style="opacity:.7;cursor:default">${inner}<span></span></div>`;
  }).join('');
}
function movsHTML(p) {
  if (!p.movimentacoes.length) return '<div class="vazio">Sem movimentações.</div>';
  const dt = s => { const m = (s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? +(m[3] + m[2] + m[1]) : 0; };
  const ms = [...p.movimentacoes].sort((a, b) => dt(b.enviadoEm) - dt(a.enviadoEm) || (+b.ordem || 0) - (+a.ordem || 0));
  return ms.map((m, i) => `<div class="mov ${i === 0 ? 'atual' : ''}"><span class="b"></span><div>
      <b>${esc(titulo(sigla(m.destino)))}</b>
      <div class="q">enviado em ${esc(m.enviadoEm)} por ${esc(titulo(m.enviadoPor))}${m.urgente === 'Sim' ? ' · urgente' : ''}</div>
      <div class="q">${m.recebidoEm === '---' || !m.recebidoEm ? '<span class="pend">ainda não recebido</span>' : `recebido em ${esc(m.recebidoEm)} por ${esc(titulo(m.recebidoPor))}`}</div>
      ${m.observacao && m.observacao !== '---' ? `<div class="q">Obs.: ${esc(m.observacao)}</div>` : ''}</div></div>`).join('');
}

// ---------------------------------------------------------- resumo com IA
const podeUsarIA = p => !processoRestrito(p) || (S.ia && S.ia.permitirRestritos);

function ctaIA(p) {
  if (!iaPronta()) {
    return `<div class="cta-ia"><div class="tx"><b>Entender este processo com IA</b>
        <span class="cinza peq">A IA é opcional e usa a sua própria chave do Gemini, do Claude ou do GPT. Ela lê os últimos documentos e diz em que etapa o processo está, o próximo passo e se algo depende de você.</span></div>
      <button class="btn" id="btnAtivarIA">${ICO.ia} Ativar a IA nas configurações</button></div>`;
  }
  if (!podeUsarIA(p)) {
    return `<div class="cta-ia"><div class="tx"><b>${ICO.cadeado} IA bloqueada para este processo</b>
        <span class="cinza peq">${naturezaDesconhecida(p)
          ? 'O SIPAC não informou se este processo é ostensivo. Por precaução, o Sigo não envia o conteúdo dele para a IA.'
          : 'Este processo é de acesso restrito. Por isso, o Sigo não envia o conteúdo dele para a IA.'}</span></div></div>`;
  }
  return `<div class="cta-ia"><div class="tx"><b>Entender este processo</b>
      <span class="cinza peq">A IA lê os últimos documentos e diz em que etapa ele está, o próximo passo e se algo depende de você. O conteúdo vai para ${esc(ia.PROVEDORES[S.ia.provedor].nome)}, com a sua chave.</span></div>
    <button class="btn pri" id="btnIA">${ICO.ia} Resumir com IA</button></div>`;
}
function iaHTML(r, p) {
  const o = p.ondeEsta || {}, pa = r.proxima_acao || {}, mim = r.depende_de_mim || [], inf = r._ia || {};
  const etapas = r.etapas || [];
  const jornada = etapas.length ? '<ol class="jornada">' + etapas.map(e => {
    const st = ['concluida', 'atual', 'prevista'].includes(e.estado) ? e.estado : 'concluida';
    const q = st === 'atual' ? `agora${o.diasNaUnidade != null ? ' · ' + dias(o.diasNaUnidade) : ''}` : (e.data || (st === 'prevista' ? 'prevista' : ''));
    return `<li class="${st}"><span class="b">${st === 'concluida' ? ICO.check : ''}</span>
      <span class="n">${esc(e.etapa)}</span><span class="q">${esc(q)}</span></li>`;
  }).join('') + '</ol>' : '';
  const voce = mim.length
    ? `<div class="bloco voce"><span class="lbl">Com você</span>${mim.map(x => `<span class="v">${esc(x.acao)}</span><span class="c">Prazo: ${esc(x.prazo)} · ${esc(x.documento)}</span>`).join('')}</div>`
    : '<div class="bloco ok"><span class="lbl">Com você</span><span class="v">Nada pendente agora</span><span class="c">pelos documentos lidos</span></div>';
  const alertas = (r.alertas || []).slice(0, 3);
  return `<div class="entender">
    <div style="display:flex;flex-direction:column;gap:6px"><span class="lbl">Em uma frase</span>
      <p class="frase-g">${esc(r.manchete || r.situacao_atual || '')}</p></div>
    ${jornada}
    <div class="grade3">
      <div class="bloco"><span class="lbl">Onde está</span><span class="v">${esc(titulo(sigla(o.unidade)))}</span>
        <span class="c">${o.recebido ? `Recebido em ${esc(o.recebidoEm)}${o.recebidoPor ? ' por ' + esc(titulo(o.recebidoPor)) : ''}` : `Enviado em ${esc(o.enviadoEm)}, ainda não recebido`}</span></div>
      <div class="bloco"><span class="lbl">Próximo passo</span><span class="v">${esc(pa.o_que || '—')}</span>
        <span class="c">${pa.quem ? 'Com ' + esc(pa.quem) : ''}${pa.base ? ' · base: ' + esc(pa.base) : ''}</span></div>
      ${voce}
    </div>
    ${alertas.length ? `<div style="display:flex;flex-direction:column;gap:6px"><span class="lbl">Fique atento</span><div class="atento">${alertas.map(a => `<div><span>${esc(a)}</span></div>`).join('')}</div></div>` : ''}
    <div class="rodape-ia"><span>Resumo por IA (${esc(inf.modelo || inf.provedor || '')}) · ${esc(r._geradoEm || '')} · pode conter erros: confira os documentos</span>
      <span class="lk"><button id="btnFontes">Ver fontes</button>${iaPronta() && podeUsarIA(p) ? '<button id="btnReIA">Gerar de novo</button>' : ''}</span></div>
    <div class="fontes" id="fontes" hidden><p style="margin:0 0 6px"><b>Histórico:</b> ${esc(r.resumo || '')}</p>
      ${(r._docsLidos || []).length ? 'Documentos: ' + r._docsLidos.map(esc).join('; ') : ''}</div>
  </div>`;
}
function msgHTML(m) {
  if (!m || !m.texto) return '';
  return `<div class="cabm"><div><b>Destravar o processo</b><span class="cinza peq">${esc(m.objetivo || 'Mensagem sugerida para quem está com ele agora')}</span></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="cinza peq" id="msgOk"></span>
        <button class="btn" id="btnCopiar">Copiar</button>
        <button class="btn pri" id="btnGmail" data-email="${esc(m.email || '')}">${ICO.mail} Abrir no Gmail</button></div></div>
    <div class="corpo">
      <span class="cinza peq">Para</span><span><b>${esc(m.destinatario)}</b>${m.email ? ' · ' + esc(m.email) : ''}${m.telefone ? ' · tel. ' + esc(m.telefone) : ''}</span>
      <span class="cinza peq">Assunto</span><span id="msgAssunto">${esc(m.assunto)}</span>
      <label for="msgTexto" class="cinza peq">Mensagem</label>
      <textarea id="msgTexto">${esc(m.texto)}</textarea>
    </div>`;
}
function ligarIA(p) {
  const a = $('#btnAtivarIA'); if (a) a.onclick = () => chrome.runtime.openOptionsPage();
  const b = $('#btnIA'); if (b) b.onclick = () => resumir(p);
  const re = $('#btnReIA'); if (re) re.onclick = () => resumir(p, true);
  const f = $('#btnFontes'); if (f) f.onclick = () => { $('#fontes').hidden = !$('#fontes').hidden; };
  const c = $('#btnCopiar');
  if (c) c.onclick = async () => {
    const t = `Assunto: ${$('#msgAssunto').textContent}\n\n${$('#msgTexto').value}`;
    try { await navigator.clipboard.writeText(t); } catch (e) { $('#msgTexto').select(); document.execCommand('copy'); }
    $('#msgOk').textContent = 'copiada ✓';
  };
  const g = $('#btnGmail');
  if (g) g.onclick = () => {
    const u = new URL('https://mail.google.com/mail/');
    u.search = new URLSearchParams({ view: 'cm', fs: '1', to: g.dataset.email || '', su: $('#msgAssunto').textContent, body: $('#msgTexto').value }).toString();
    chrome.tabs.create({ url: u.toString() });
  };
}

/** Gera (ou reaproveita) o resumo. Não roda se a IA estiver desligada ou o processo for restrito. */
async function obterResumo(p, forcar) {
  if (!iaPronta()) throw new Error('A IA está desligada. Ative-a nas configurações.');
  if (!podeUsarIA(p)) throw new Error('Este processo é de acesso restrito. Por isso, o Sigo não envia o conteúdo dele para a IA.');
  const assin = assinatura(p);
  const cache = S.resumos || {};
  if (!forcar && cache[p.numero] && cache[p.numero].assinatura === assin) return cache[p.numero].resumo;
  const cfgIA = S.ia;
  const aceitar = d => cfgIA.permitirRestritos || !ehRestrito(d.natureza);
  const { itens, log } = await sipac.baixarDocumentos(p.documentos || [], { maxDocs: cfgIA.maxDocs || 6, aceitar });
  const out = await ia.gerar(
    { provedor: cfgIA.provedor, chave: cfgIA.chaves[cfgIA.provedor], modelo: (cfgIA.modelos || {})[cfgIA.provedor] },
    p, itens, { nomeUsuario: sipac.usuario.nome, maxDocs: cfgIA.maxDocs || 6 });
  out._docsLidos = log;
  out._geradoEm = new Date().toLocaleDateString('pt-BR');
  const c = { ...(S.resumos || {}) };
  c[p.numero] = { assinatura: assin, resumo: out };
  // guarda só os 60 mais recentes
  const chaves = Object.keys(c); if (chaves.length > 60) delete c[chaves[0]];
  await salvar('resumos', c);
  return out;
}
async function resumir(p, forcar, irParaMsg) {
  $('#secIA').innerHTML = '<div class="entender"><div class="carregando" style="padding:0">Lendo os últimos documentos e montando o resumo… (até 1 minuto)</div></div>';
  try {
    const r = await obterResumo(p, forcar);
    p.resumoIA = r;
    if (procAtual !== p || vista !== 'proc') return;
    $('#secIA').innerHTML = iaHTML(r, p);
    const sm = $('#secMsg'); sm.innerHTML = msgHTML(r.mensagem); sm.hidden = !(r.mensagem && r.mensagem.texto);
    ligarIA(p);
    if (irParaMsg && !sm.hidden) sm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    if (procAtual !== p) return;
    $('#secIA').innerHTML = `<div class="cta-ia"><div class="tx"><b>Não foi possível gerar o resumo</b></div>${erroHTML(e, () => resumir(p, forcar, irParaMsg))}</div>`;
  }
}

// ===================================================================== Acompanhar
let verificando = false, progresso = '';
const ultimas = () => S.ultimaVerificacao || {};
const vistos = () => S.vistos || {};
const novidades = (n, f) => (f && f.mudancas && f.mudancas.length && vistos()[n] !== f.verificadoEm) ? f.mudancas : [];
function motivo(n, f) {
  if (!f || !f.unidade) return null;
  if (((f.ia && f.ia.comVoce) || []).length) return { cls: 'p-amber', txt: 'Com você', peso: 4 };
  if (f.parado) return { cls: 'p-red', txt: `Parado há ${f.diasNaUnidade} dias`, peso: 3 };
  if (novidades(n, f).length) return { cls: 'p-blue', txt: 'Novidade', peso: 2 };
  return null;
}
const chaveData = s => { const m = (s || '').match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/); return m ? m[3] + m[2] + m[1] + m[4] + m[5] : ''; };
function haQuanto(s) {
  const m = (s || '').match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/); if (!m) return '';
  const min = Math.round((Date.now() - new Date(+m[3], m[2] - 1, +m[1], +m[4], +m[5])) / 60000);
  return min < 1 ? 'agora' : min < 60 ? `há ${min} min` : min < 1440 ? `há ${Math.round(min / 60)} h` : `há ${Math.round(min / 1440)} dias`;
}
function cartaoAtencao(n, f, mo) {
  const nov = novidades(n, f), inf = f.ia || {};
  const frase = mo.txt === 'Novidade' ? nov.map(t => t.replace(/:\s*(.+)$/, (_, r) => ': ' + titulo(r))).join('. ') : (inf.manchete || '');
  const podePedir = f.parado || !f.recebido;
  return `<article class="cartao at">
    <div class="l1"><span class="pill ${mo.cls}"><i></i>${esc(mo.txt)}</span><span class="mono cinza" style="font-size:12px">${esc(n)}</span></div>
    <div><h3>${esc(titulo(f.assunto || favoritos()[n] || ''))}</h3>${frase ? `<p class="frase">${esc(frase)}</p>` : ''}</div>
    <div class="fatos">
      <div><span>Está em</span><b title="${esc(f.unidade)}">${esc(titulo(sigla(f.unidade)))}</b></div>
      <div><span>${f.recebido ? 'Desde' : 'Enviado em'}</span><b>${esc(f.recebido ? f.recebidoEm : f.enviadoEm)}</b></div>
      ${(inf.comVoce || []).length ? `<div><span>Você precisa</span><b title="${esc(inf.comVoce.join('; '))}" style="color:var(--amber)">${esc(inf.comVoce[0])}</b></div>`
        : (inf.proxima ? `<div><span>Próximo passo</span><b title="${esc(inf.proxima)}">${esc(inf.proxima)}</b></div>` : '')}
    </div>
    <div class="botoes">
      ${podePedir && iaPronta() ? `<button class="btn pri" data-pedir="${esc(n)}">${ICO.mail} Pedir andamento</button>` : ''}
      <button class="btn" data-abrir="${esc(n)}">Ver processo</button>
      ${nov.length ? `<button class="btn leve" data-visto="${esc(n)}">Marcar como visto</button>` : ''}
    </div></article>`;
}
function linhaNormal(n, f) {
  f = f || {};
  const onde = f.unidade ? esc(titulo(sigla(f.unidade))) + (f.recebido ? '' : ' <span class="cinza">· a receber</span>')
    : `<span class="cinza">${f.erro ? 'não foi possível verificar' : 'verificando…'}</span>`;
  return `<button class="lin" data-abrir="${esc(n)}">
    <span class="t"><b>${esc(titulo(f.assunto || favoritos()[n] || n))}</b><span class="mono">${esc(n)}</span></span>
    <span class="d">${f.unidade ? dias(f.diasNaUnidade) : ''}</span>
    <span class="u" title="${esc(f.unidade || '')}">${onde}</span></button>`;
}
function renderAcomp() {
  const favs = Object.keys(favoritos()), ult = ultimas();
  const quando = favs.map(n => ult[n] && ult[n].verificadoEm).filter(Boolean).sort((a, b) => chaveData(a) < chaveData(b) ? -1 : 1).pop();
  const cab = sub => `<section class="cab"><div class="tit"><h1>Acompanhar</h1><p class="sub">${sub}</p></div>
    <div class="acao"><span class="cinza peq">${verificando ? esc(progresso) : (quando ? 'Verificado ' + haQuanto(quando) : '')}</span>
      <button class="btn" id="btnVerificar" ${verificando || !favs.length ? 'disabled' : ''}>${ICO.atualizar} Verificar agora</button></div></section>`;
  if (!favs.length) {
    $('#vAcomp').innerHTML = cab('Nenhum processo acompanhado ainda.') + `<div class="cartao vazio">
      Abra um processo e toque em <b>Acompanhar</b> para vê-lo aqui.<br><br><button class="btn pri" id="irBuscar">Buscar processo</button></div>`;
    $('#irBuscar').onclick = () => document.querySelector('nav.vistas button[data-v=buscar]').click();
    return;
  }
  const atencao = [], normal = [];
  favs.forEach(n => { const mo = motivo(n, ult[n]); (mo ? atencao : normal).push({ n, mo }); });
  atencao.sort((a, b) => b.mo.peso - a.mo.peso || (ult[b.n].diasNaUnidade || 0) - (ult[a.n].diasNaUnidade || 0));
  normal.sort((a, b) => ((ult[b.n] || {}).diasNaUnidade || 0) - ((ult[a.n] || {}).diasNaUnidade || 0));
  const pl = (k, s, p) => k === 1 ? s : p;
  const sub = atencao.length
    ? `<b>${atencao.length} de ${favs.length} ${pl(favs.length, 'processo', 'processos')}</b> ${pl(atencao.length, 'pede', 'pedem')} sua atenção.`
    : `Tudo andando: <b>${favs.length} ${pl(favs.length, 'processo', 'processos')}</b> sem pendências.`;
  const erroSessao = favs.some(n => ult[n] && ult[n].login);
  $('#vAcomp').innerHTML = cab(sub)
    + (erroSessao ? erroHTML({ login: true }, () => verificar(Object.keys(favoritos()))) : '')
    + (atencao.length ? `<section style="display:flex;flex-direction:column;gap:12px"><h2 class="lbl">Precisa de atenção</h2>
        <div class="grade2">${atencao.map(x => cartaoAtencao(x.n, ult[x.n], x.mo)).join('')}</div></section>` : '')
    + (normal.length ? `<section style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;justify-content:space-between;align-items:baseline"><h2 class="lbl">${atencao.length ? 'Andando normalmente' : 'Seus processos'}</h2><span class="cinza peq">${normal.length} ${pl(normal.length, 'processo', 'processos')}</span></div>
        <div class="cartao lista">${normal.map(x => linhaNormal(x.n, ult[x.n])).join('')}</div></section>` : '');
  $('#btnVerificar').onclick = () => verificar(Object.keys(favoritos()));
}
$('#vAcomp').addEventListener('click', e => {
  const a = e.target.closest('[data-abrir]'), p = e.target.closest('[data-pedir]'), v = e.target.closest('[data-visto]');
  if (p) abrir(p.dataset.pedir, 'acomp', { mensagem: true });
  else if (a) abrir(a.dataset.abrir, 'acomp');
  else if (v) { salvar('vistos', { ...vistos(), [v.dataset.visto]: ultimas()[v.dataset.visto].verificadoEm }); renderAcomp(); }
});

/** Confere um processo e diz o que mudou desde a última verificação. */
async function acompanharUm(numero) {
  const proc = await sipac.detalhar(numero);
  guardarAssunto(proc);
  const depois = foto(proc);
  const hist = { ...(S.acompanhamento || {}) };
  const antes = (hist[proc.numero] || {}).foto;
  const mud = mudancas(antes, depois);
  const verificadoEm = agora();
  hist[proc.numero] = { foto: depois, verificadoEm, ultimasMudancas: mud.length ? mud : ((hist[proc.numero] || {}).ultimasMudancas || []) };
  await salvar('acompanhamento', hist);
  let resumoCurto = null, iaErro = null;
  if (iaPronta() && podeUsarIA(proc)) {
    try { resumoCurto = iaCurta(await obterResumo(proc)); } catch (e) { if (e.login) throw e; iaErro = String(e.message).slice(0, 300); }
  }
  return { ...depois, mudancas: mud, primeiraVez: !antes, ia: resumoCurto, iaErro, verificadoEm };
}
async function verificar(lista) {
  if (verificando || !lista.length) return;
  verificando = true;
  const ult = { ...ultimas() };
  for (let i = 0; i < lista.length; i++) {
    progresso = `Verificando ${i + 1} de ${lista.length}…`; if (vista === 'acomp') renderAcomp();
    try { ult[lista[i]] = await acompanharUm(lista[i]); marcarStatus(true, sipac.usuario.nome); }
    catch (e) {
      ult[lista[i]] = { ...(ult[lista[i]] || {}), erro: e.message, login: !!e.login, mudancas: [] };
      await salvar('ultimaVerificacao', ult);
      if (e.login) break;  // sem sessão, não adianta seguir
    }
    if (ult[lista[i]] && !ult[lista[i]].erro) delete ult[lista[i]].login;
    await salvar('ultimaVerificacao', ult);
  }
  verificando = false; progresso = '';
  if (vista === 'acomp') renderAcomp();
}
function verificarPendentes() {
  const ult = ultimas();
  verificar(Object.keys(favoritos()).filter(n => !(ult[n] && ult[n].unidade)));
}

// ===================================================================== termos (LGPD)
function abrirModal(html) { $('#caixa').innerHTML = html; $('#modal').hidden = false; }
function fecharModal() { $('#modal').hidden = true; $('#caixa').innerHTML = ''; }
function pedirAceiteTermos() {
  return new Promise(resolve => {
    abrirModal(`${TERMOS_HTML}
      <label class="aceite"><input type="checkbox" id="chkTermos"> Li e aceito os termos de uso e privacidade.</label>
      <div class="acoes"><button class="btn pri" id="btnAceitar" disabled>Continuar</button></div>`);
    $('#chkTermos').onchange = e => { $('#btnAceitar').disabled = !e.target.checked; };
    $('#btnAceitar').onclick = async () => {
      await salvar('termos', { versao: VERSAO_TERMOS, em: agoraISO() });
      fecharModal(); resolve();
    };
  });
}
$('#btnTermos').onclick = () => {
  const aceite = S.termos ? `<p class="cinza peq">Você aceitou a versão ${esc(S.termos.versao)} em ${esc(new Date(S.termos.em).toLocaleString('pt-BR'))}.</p>` : '';
  abrirModal(`${TERMOS_HTML}${aceite}<div class="acoes"><button class="btn" id="btnFechar">Fechar</button></div>`);
  $('#btnFechar').onclick = fecharModal;
};

// mudanças feitas nas configurações (outra página) valem na hora
chrome.storage.onChanged.addListener((mud, area) => {
  if (area !== 'local') return;
  for (const [k, v] of Object.entries(mud)) S[k] = v.newValue;
  if (mud.ia && vista === 'proc' && procAtual && !procAtual.resumoIA && $('#secIA')) { $('#secIA').innerHTML = ctaIA(procAtual); ligarIA(procAtual); }
});

// ===================================================================== início
(async function iniciar() {
  await carregar();
  if (!termosAceitos()) await pedirAceiteTermos();
  recentes(); checar();
  if (Object.keys(favoritos()).length) { mostrar('acomp'); renderAcomp(); verificarPendentes(); }
  else mostrar('buscar');
})();
