// Funções executadas DENTRO da página do SIPAC (chrome.scripting.executeScript, world MAIN).
// Cada função precisa ser autocontida: nada de variáveis de fora dela.
// Mapeado em 01/10/2026 contra SIPAC v5.9.1 (sipac.sig.ufal.br). Se o SIPAC mudar de tela, ajuste aqui.

export function pgEstado() {
  return {
    url: location.href,
    senha: !!document.querySelector('input[type=password]'),
    expirada: /expirad/i.test(location.href),
  };
}

export function pgExiste(sel) {
  return !!document.querySelector(sel);
}

export function pgUsuario() {
  const c = s => (s || '').replace(/\s+/g, ' ').trim();
  for (const sel of ['#info-usuario .usuario span', '#info-usuario .usuario', '.usuario span[title]', 'p.usuario', 'span.nome-usuario']) {
    const e = document.querySelector(sel);
    if (e && c(e.textContent).length > 4) return c(e.textContent);
  }
  const m = (document.body.innerText || '').match(/Orçamento:\s*\d{4}\s*\n+\s*([A-ZÀ-Ü][A-ZÀ-Ü .'-]{4,})\s*\n/);
  return m ? c(m[1]) : '';
}

/** Menu JSCookMenu: Protocolo > Processos > Consultar Processo. O clique sai depois do retorno (navega). */
export function pgAbrirConsulta() {
  const td = [...document.querySelectorAll('td')].find(e => e.textContent.trim() === 'Consultar Processo');
  if (!td) return false;
  const row = td.closest('tr');
  setTimeout(() => ['mouseover', 'mousedown', 'mouseup', 'click']
    .forEach(ev => row.dispatchEvent(new MouseEvent(ev, { bubbles: true }))), 0);
  return true;
}

export function pgPreencher(radio, campos) {
  const r = document.getElementById(radio);
  if (!r) return false;
  if (!r.checked) r.click();
  for (const [id, v] of Object.entries(campos)) {
    const e = document.getElementById(id);
    if (!e) return false;
    e.disabled = false;
    e.value = v;
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return true;
}

export function pgClicar(id) {
  const b = document.getElementById(id);
  if (!b) return false;
  setTimeout(() => b.click(), 0);
  return true;
}

/** Abre o "Processo Detalhado" na própria aba (target '' em vez do popup). */
export function pgAbrirDetalhe(params) {
  const f = document.getElementById('processoForm');
  if (!f || typeof window.jsfcljs !== 'function') return false;
  setTimeout(() => window.jsfcljs(f, params, ''), 0);
  return true;
}

export function pgMensagens() {
  return [...document.querySelectorAll('#painel-erros li, ul.erros li, ul.info li, ul.warning li')]
    .map(li => li.innerText.trim()).filter(Boolean);
}

export function pgResultados() {
  return [...document.querySelectorAll('a[id$=":l_processo_detalhado"]')].map(a => {
    const tr = a.closest('tr');
    const tds = tr.querySelectorAll(':scope > td');
    const m = (a.getAttribute('onclick') || '').match(/'idProcesso':'(\d+)'/);
    let t = '';
    for (let n = tr.nextElementSibling; n && !n.querySelector('a[id$=":l_processo_detalhado"]'); n = n.nextElementSibling)
      t += ' ' + n.innerText;
    t = t.replace(/\s+/g, ' ');
    const g = re => { const x = t.match(re); return x ? x[1].trim() : ''; };
    const limpo = v => (v === '---' ? '' : v);
    const cel = i => tds[i] ? tds[i].innerText.replace(/\s+/g, ' ').trim() : '';
    return {
      numero: a.textContent.trim(),
      idProcesso: m ? m[1] : null,
      linkId: a.id,
      eletronico: !!tr.querySelector('img[title="Processo Eletrônico"]'),
      interessados: cel(1), origem: cel(2), localAtual: cel(3),
      ultimaOrigem: g(/Origem:\s*(.*?)\s*Destino:/),
      ultimoDestino: g(/Destino:\s*(.*?)\s*Situação:/),
      situacao: g(/Situação:\s*(.*?)\s*(?:Assunto do Processo:|Assunto Detalhado:|Documentos do Processo|$)/),
      assunto: limpo(g(/Assunto do Processo:\s*(.*?)\s*(?:Assunto Detalhado:|Documentos do Processo|$)/)),
      detalhado: limpo(g(/Assunto Detalhado:\s*(.*?)\s*(?:Documentos do Processo|$)/)),
    };
  });
}

/** Plano B da busca por nome: faz o POST do link "Processo Detalhado" em paralelo e lê os Dados Gerais. */
export async function pgAssuntos(itens, conc, prazo) {
  const f = document.getElementById('processoForm');
  if (!f) return {};
  const base = new URLSearchParams(new FormData(f));
  base.delete('processoForm:b_buscar_processo'); base.delete('processoForm:b_cancelar');
  const c = s => (s || '').replace(/\s+/g, ' ').trim();
  const fim = Date.now() + prazo, out = {}, fila = [...itens];
  const um = async it => {
    const fd = new URLSearchParams(base);
    fd.set(it.linkId, it.linkId); fd.set('idProcesso', it.idProcesso); fd.set('popup', 'true');
    try {
      const r = await fetch(f.action, { method: 'POST', body: fd, credentials: 'include' });
      const d = new DOMParser().parseFromString(await r.text(), 'text/html');
      const tab = [...d.querySelectorAll('table.formulario')].find(t => /Dados Gerais/.test((t.caption || {}).textContent || ''));
      if (!tab) return;
      const o = {};
      tab.querySelectorAll('tr').forEach(tr => {
        if (tr.closest('table') !== tab) return;
        const th = tr.querySelector(':scope > th'), td = tr.querySelector(':scope > td');
        if (th && td) o[c(th.textContent).replace(/:$/, '')] = c(td.textContent);
      });
      out[it.numero] = { assunto: o['Assunto do Processo'] || '', detalhado: o['Assunto Detalhado'] || '', autuacao: o['Data de Autuação'] || '' };
    } catch (e) { /* segue com os demais */ }
  };
  await Promise.all(Array.from({ length: conc }, async () => {
    while (fila.length && Date.now() < fim) await um(fila.shift());
  }));
  return out;
}

export function pgDadosGerais() {
  const c = s => (s || '').replace(/\s+/g, ' ').trim();
  const pares = tab => {
    const o = {};
    if (!tab) return o;
    tab.querySelectorAll('tr').forEach(tr => {
      if (tr.closest('table') !== tab) return;
      const th = tr.querySelector(':scope > th');
      const td = tr.querySelector(':scope > td');
      if (th && td) o[c(th.innerText).replace(/:$/, '')] = c(td.innerText);
    });
    return o;
  };
  const porCaption = (sel, re) => [...document.querySelectorAll(sel)].find(t => re.test((t.caption && t.caption.innerText) || ''));
  return {
    dados: pares(porCaption('table.formulario', /Dados Gerais/)),
    ultimaMovimentacao: pares(porCaption('table.subFormulario', /Última Movimentação/)),
  };
}

export function pgDocumentos() {
  const c = s => (s || '').replace(/\s+/g, ' ').trim();
  const tab = document.getElementById('processoForm:documentosProcesso');
  if (!tab || !tab.tBodies[0]) return [];
  const out = [];
  let atual = null;
  [...tab.tBodies[0].rows].forEach(r => {
    if (r.cells.length >= 7) {
      const a = r.querySelector('a[onclick*="verArquivoDocumento"]');
      const url = a ? ((a.getAttribute('onclick').match(/'(\/sipac\/verArquivoDocumento[^']+)'/) || [])[1] || null) : null;
      const det = r.querySelector('a[onclick*="documentoDetalhado"]');
      const idDoc = det ? (det.getAttribute('onclick').match(/documentoDetalhado\((\d+)\)/) || [])[1] : null;
      const icone = ((r.cells[0].querySelector('img') || {}).title) || '';
      const escrito = /Escrito/i.test(icone);
      atual = {
        ordem: c(r.cells[1].innerText), tipo: c(r.cells[2].innerText), data: c(r.cells[3].innerText),
        origem: c(r.cells[4].innerText), natureza: c(r.cells[5].innerText),
        url: url || (idDoc ? '/sipac/protocolo/documento/documento_visualizacao.jsf?imprimir=true&idDoc=' + idDoc : null),
        escrito, acessoNegado: !!r.querySelector('img[title="Acesso Negado"]'), idDocumento: idDoc || null, assuntoDetalhado: '',
      };
      out.push(atual);
    } else if (atual && /Assunto Detalhado:/.test(r.innerText)) {
      atual.assuntoDetalhado = c(r.innerText.replace('Assunto Detalhado:', ''));
    }
  });
  return out;
}

/** Abas RichFaces: só a aba ativa fica no DOM. */
export function pgAba(nome) {
  const h = [...document.querySelectorAll('td.rich-tab-header')].find(x => x.innerText.trim() === nome);
  if (!h) return false;
  setTimeout(() => h.click(), 0);
  return true;
}

export function pgMovimentos() {
  const c = s => (s || '').replace(/\s+/g, ' ').trim();
  const tab = document.getElementById('processoForm:tableMovimentos');
  if (!tab || !tab.tBodies[0]) return [];
  const out = [];
  let atual = null;
  const contato = cel => {
    const t = c((cel.querySelector('.tooltip') || {}).textContent || '');
    const email = (t.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/) || [''])[0];
    const tel = ((t.match(/Telefone:\s*([\d()\s-]{3,})/) || [])[1] || '').trim();
    const ramal = ((cel.querySelector('span[title]') || {}).title || '').match(/Ramal:\s*([\d-]+)/);
    return { email, telefone: tel || (ramal ? ramal[1] : '') };
  };
  [...tab.tBodies[0].rows].forEach(r => {
    if (r.cells.length >= 9) {
      const quem = r.cells[3].querySelector('span[title]');
      const rec = r.cells[5].querySelector('span[title]');
      atual = {
        ordem: c(r.cells[0].innerText), destino: c(r.cells[1].innerText), enviadoEm: c(r.cells[2].innerText),
        enviadoPor: quem ? c(quem.title.split(' - Ramal')[0]) : c(r.cells[3].innerText).split(' ')[0],
        recebidoEm: c(r.cells[4].innerText),
        recebidoPor: rec ? c(rec.title.split(' - Ramal')[0]) : c(r.cells[5].innerText),
        tempoEsperado: c(r.cells[6].innerText), urgente: c(r.cells[7].innerText), emFluxo: c(r.cells[8].innerText),
        observacao: '', despachos: '',
        contatoEnvio: contato(r.cells[3]), contatoReceb: contato(r.cells[5]),
      };
      out.push(atual);
    } else if (atual) {
      const t = c(r.innerText);
      if (t.startsWith('Observação:')) atual.observacao = c(t.replace('Observação:', ''));
      else if (t.startsWith('Despachos')) atual.despachos = t;
    }
  });
  return out;
}

/** Baixa um documento pela sessão logada (mesma origem). PDF volta em base64; HTML volta como texto. */
export async function pgBaixar(u, maxBytes) {
  const r = await fetch(u, { credentials: 'include' });
  const tipo = r.headers.get('content-type') || '';
  const buf = await r.arrayBuffer();
  if (/html/i.test(tipo)) {
    const cs = (tipo.match(/charset=([\w-]+)/i) || [])[1] || 'iso-8859-1';
    let html;
    try { html = new TextDecoder(cs).decode(buf); } catch (e) { html = new TextDecoder('iso-8859-1').decode(buf); }
    if (/type=["']?password/i.test(html)) return { tipo: 'login' };
    const d = new DOMParser().parseFromString(html, 'text/html');
    d.querySelectorAll('script,style').forEach(e => e.remove());
    d.querySelectorAll('br,p,tr,div,li,h1,h2,h3').forEach(e => e.append('\n'));
    const texto = (d.body ? d.body.textContent : '').replace(/[ \t\u00a0]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
    return { tipo: 'html', texto: texto.slice(0, 20000) };
  }
  const b = new Uint8Array(buf);
  const ehPdf = /pdf/i.test(tipo) || (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46);
  if (!ehPdf) return { tipo: 'outro', mime: tipo };
  if (b.length > maxBytes) return { tipo: 'grande', bytes: b.length };
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return { tipo: 'pdf', base64: btoa(s), bytes: b.length };
}

/** Confere a sessão com uma requisição na mesma origem, sem navegar. */
/** Link "Sair" do SIG (o endereço exato varia entre versões, por isso é lido da tela). */
export function pgLinkSair() {
  const as = [...document.querySelectorAll('a[href]')];
  const a = as.find(x => /^\s*sair\s*$/i.test(x.textContent)) || as.find(x => /log_?off|logout|sair/i.test(x.getAttribute('href') || ''));
  return a ? a.href : null;
}

export async function pgChecarSessao(portal) {
  try {
    const r = await fetch(portal, { credentials: 'include' });
    const html = await r.text();
    const ok = r.ok && !/type=["']?password/i.test(html) && /portal_administrativo/.test(r.url);
    let nome = '';
    if (ok) {
      const m = html.match(/class="usuario"[^>]*>(?:\s*<[^>]+>)*\s*([^<]{5,}?)\s*</);
      if (m) nome = m[1].replace(/\s+/g, ' ').trim();
    }
    return { logado: ok, nome };
  } catch (e) {
    return { logado: false, nome: '' };
  }
}
