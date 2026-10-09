"""Fluxos do SIPAC/UFAL operados via Playwright (somente leitura).

Mapeado em 01/10/2026 contra SIPAC v5.9.1 (sipac.sig.ufal.br).
"""
import re
import unicodedata

BASE = "https://sipac.sig.ufal.br"
PORTAL = BASE + "/sipac/portal_administrativo/index.jsf"


class NaoLogado(Exception):
    pass


class ErroSipac(Exception):
    pass


# ---------------------------------------------------------------- JS extratores

JS_ABRIR_CONSULTA = """() => {
  const td = [...document.querySelectorAll('td')].find(e => e.textContent.trim() === 'Consultar Processo');
  if (!td) return false;
  const row = td.closest('tr');
  ['mouseover','mousedown','mouseup','click'].forEach(ev => row.dispatchEvent(new MouseEvent(ev, {bubbles: true})));
  return true;
}"""

JS_RESULTADOS = r"""() => [...document.querySelectorAll('a[id$=":l_processo_detalhado"]')].map(a => {
  const tr = a.closest('tr');
  const tds = tr.querySelectorAll(':scope > td');
  const m = (a.getAttribute('onclick') || '').match(/'idProcesso':'(\d+)'/);
  // As linhas seguintes (até o próximo processo) trazem a última movimentação e os assuntos.
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
})"""

JS_MENSAGENS = """() => [...document.querySelectorAll('#painel-erros li, ul.erros li, ul.info li, ul.warning li')]
  .map(li => li.innerText.trim()).filter(Boolean)"""

JS_DADOS_GERAIS = r"""() => {
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
  const porCaption = (sel, re) => [...document.querySelectorAll(sel)]
    .find(t => re.test((t.caption && t.caption.innerText) || ''));
  return {
    dados: pares(porCaption('table.formulario', /Dados Gerais/)),
    ultimaMovimentacao: pares(porCaption('table.subFormulario', /Última Movimentação/)),
  };
}"""

JS_DOCUMENTOS = r"""() => {
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
      const escrito = /Escrito/i.test(icone);  // criado no SIPAC, sem arquivo: usa a versão de impressão
      const urlFinal = url || (idDoc ? '/sipac/protocolo/documento/documento_visualizacao.jsf?imprimir=true&idDoc=' + idDoc : null);
      atual = {
        ordem: c(r.cells[1].innerText), tipo: c(r.cells[2].innerText), data: c(r.cells[3].innerText),
        origem: c(r.cells[4].innerText), natureza: c(r.cells[5].innerText),
        url: urlFinal, escrito, acessoNegado: !!r.querySelector('img[title="Acesso Negado"]'), idDocumento: idDoc || null, assuntoDetalhado: '',
      };
      out.push(atual);
    } else if (atual && /Assunto Detalhado:/.test(r.innerText)) {
      atual.assuntoDetalhado = c(r.innerText.replace('Assunto Detalhado:', ''));
    }
  });
  return out;
}"""

PREFIXOS_ARQUIVO = (
    "/sipac/verArquivoDocumento?",                             # documento com arquivo anexado (PDF)
    "/sipac/protocolo/documento/documento_visualizacao.jsf?",  # documento escrito no SIPAC (HTML)
)

JS_USUARIO = r"""() => {
  const c = s => (s || '').replace(/\s+/g, ' ').trim();
  for (const sel of ['#info-usuario .usuario span', '#info-usuario .usuario', '.usuario span[title]', 'p.usuario', 'span.nome-usuario']) {
    const e = document.querySelector(sel);
    if (e && c(e.textContent).length > 4) return c(e.textContent);
  }
  // Plano B: no portal, o nome vem logo depois de "Orçamento: AAAA".
  const m = (document.body.innerText || '').match(/Orçamento:\s*\d{4}\s*\n+\s*([A-ZÀ-Ü][A-ZÀ-Ü .'-]{4,})\s*\n/);
  return m ? c(m[1]) : '';
}"""

usuario_logado = {"nome": ""}


async def _capturar_usuario(page):
    try:
        nome = await page.evaluate(JS_USUARIO)
        if nome:
            usuario_logado["nome"] = nome
    except Exception:
        pass


JS_ABA = """(nome) => {
  const h = [...document.querySelectorAll('td.rich-tab-header')].find(x => x.innerText.trim() === nome);
  if (!h) return false;
  h.click();
  return true;
}"""

JS_MOVIMENTOS = r"""() => {
  const c = s => (s || '').replace(/\s+/g, ' ').trim();
  const tab = document.getElementById('processoForm:tableMovimentos');
  if (!tab || !tab.tBodies[0]) return [];
  const out = [];
  let atual = null;
  // Contato da pessoa: o SIPAC mostra telefone/e-mail num tooltip (span.tooltip) na mesma célula.
  const contato = cel => {
    const t = c((cel.querySelector('.tooltip') || {}).textContent || '');
    const email = (t.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/) || [''])[0];
    const tel = ((t.match(/Telefone:\s*([\d()\s-]{3,})/) || [])[1] || '').trim();
    const ramal = ((cel.querySelector('span[title]') || {}).title || '').match(/Ramal:\s*([\d-]+)/);
    return {email, telefone: tel || (ramal ? ramal[1] : '')};
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
}"""


# ---------------------------------------------------------------- utilitários

RADICAL_UFAL = "23065"
RE_NUMERO = re.compile(r"^\s*(\d{5})\s*\.?\s*(\d{1,6})\s*/?\s*(\d{4})\s*-?\s*(\d{2})\s*$")


def parece_numero(texto: str) -> bool:
    """Sem letras e com dígitos: a pessoa quis digitar um número de processo."""
    t = texto or ""
    return any(c.isdigit() for c in t) and not any(c.isalpha() for c in t)


def dv_nup(base15: str) -> str:
    """Dígitos verificadores do NUP (módulo 11, pesos decrescentes até 2)."""
    def calc(ds):
        soma = sum(x * w for x, w in zip(ds, range(len(ds) + 1, 1, -1)))
        return (11 - soma % 11) % 10
    d = [int(c) for c in base15]
    d1 = calc(d)
    return f"{d1}{calc(d + [d1])}"


def validar_numero(texto: str):
    """Valida um nº de processo da UFAL sem consultar o SIPAC.
    Retorna (radical, numero, ano, dv) ou lança ErroSipac com o motivo."""
    m = RE_NUMERO.match(texto or "")
    if not m:
        raise ErroSipac("Formato inválido. Use 23065.NNNNNN/AAAA-DV (ex.: 23065.029470/2026-43).")
    radical, num, ano, dv = m.groups()
    if radical != RADICAL_UFAL:
        raise ErroSipac(f"Não é processo da UFAL: o número deve começar com {RADICAL_UFAL} (veio {radical}).")
    num = num.zfill(6)
    if not 1990 <= int(ano) <= 2100:
        raise ErroSipac(f"Ano {ano} inválido.")
    esperado = dv_nup(radical + num + ano)
    if dv != esperado:
        raise ErroSipac(f"Dígito verificador não confere ({dv}). Confira o número digitado.")
    return radical, num, ano, dv


def parse_numero(texto: str):
    """Como validar_numero, mas devolve None em vez de erro."""
    try:
        return validar_numero(texto)
    except ErroSipac:
        return None


def sem_acento(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")


def variantes_nome(nome: str) -> list:
    """Grafias a tentar no SIPAC: como digitado e sem acentos (sem duplicar)."""
    n = " ".join(nome.split()).upper()
    return list(dict.fromkeys([n, sem_acento(n)]))


async def _checar_login(page):
    if "expirada" in page.url or await page.locator("input[type=password]").count() > 0:
        raise NaoLogado("Sessão do SIPAC não está ativa. Faça login na janela do navegador.")


async def fazer_login(page, usuario: str, senha: str) -> bool:
    """Preenche o formulário de login do SIPAC (usuarioForm -> /sipac/logon.do)."""
    await page.goto(BASE + "/sipac/", wait_until="domcontentloaded")
    await page.fill("form[name=usuarioForm] input[name=login]", usuario)
    await page.fill("form[name=usuarioForm] input[name=senha]", senha)
    async with page.expect_navigation(wait_until="domcontentloaded"):
        await page.click("form[name=usuarioForm] input[type=submit]")
    ok = await page.locator("input[type=password]").count() == 0
    if ok:
        await page.goto(PORTAL, wait_until="domcontentloaded")
        await _capturar_usuario(page)
    return ok


async def esta_logado(ctx) -> bool:
    """Checa a sessão com uma requisição paralela, sem mexer na janela."""
    r = await ctx.request.get(PORTAL)
    html = await r.text()
    tem_senha = re.search(r"type=[\"']?password", html, re.I) is not None
    ok = r.ok and not tem_senha and "portal_administrativo" in r.url
    if ok and not usuario_logado["nome"]:
        m = re.search(r'class="usuario"[^>]*>(?:\s*<[^>]+>)*\s*([^<]{5,}?)\s*<', html)
        if m:
            usuario_logado["nome"] = " ".join(m.group(1).split())
    return ok


async def _abrir_consulta(page):
    await page.goto(PORTAL, wait_until="domcontentloaded")
    await _checar_login(page)
    if not usuario_logado["nome"]:
        await _capturar_usuario(page)
    async with page.expect_navigation(wait_until="domcontentloaded"):
        ok = await page.evaluate(JS_ABRIR_CONSULTA)
        if not ok:
            raise ErroSipac("Item de menu 'Consultar Processo' não encontrado (o SIPAC mudou?).")
    await page.wait_for_selector('[id="processoForm:b_buscar_processo"]')


# Plano B (quando a lista não traz o assunto): para cada processo, faz o mesmo POST
# do link "Processo Detalhado" (fetch em paralelo, sem navegar) e extrai a tabela "Dados Gerais".
JS_ASSUNTOS = r"""async ({itens, conc, prazo}) => {
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
      const r = await fetch(f.action, {method: 'POST', body: fd, credentials: 'include'});
      const d = new DOMParser().parseFromString(await r.text(), 'text/html');
      const tab = [...d.querySelectorAll('table.formulario')].find(t => /Dados Gerais/.test((t.caption || {}).textContent || ''));
      if (!tab) return;
      const o = {};
      tab.querySelectorAll('tr').forEach(tr => {
        if (tr.closest('table') !== tab) return;
        const th = tr.querySelector(':scope > th'), td = tr.querySelector(':scope > td');
        if (th && td) o[c(th.textContent).replace(/:$/, '')] = c(td.textContent);
      });
      out[it.numero] = {assunto: o['Assunto do Processo'] || '', detalhado: o['Assunto Detalhado'] || '',
                        autuacao: o['Data de Autuação'] || ''};
    } catch (e) {}
  };
  await Promise.all(Array.from({length: conc}, async () => {
    while (fila.length && Date.now() < fim) await um(fila.shift());
  }));
  return out;
}"""

MAX_ASSUNTOS = 80


async def buscar(page, numero: str = "", interessado: str = "", conhecidos=None):
    """Busca processos por número OU nome do interessado. Retorna (lista, mensagens).
    Na busca por nome, completa o assunto dos processos que não estão em `conhecidos`."""
    await _abrir_consulta(page)
    partes = validar_numero(numero) if numero else None  # filtro antes de tocar no SIPAC
    if partes:
        radical, num, ano, dv = partes
        await page.check('[id="processoForm:byIdentificadores"]')
        await page.fill('[id="processoForm:radical"]', radical)
        await page.fill('[id="processoForm:numProtocolo"]', num)
        await page.fill('[id="processoForm:ano"]', ano)
        await page.fill('[id="processoForm:dv"]', dv)
    elif interessado:
        await page.check('[id="processoForm:byNomeInteressado"]')
        await page.fill('[id="processoForm:interessadoNome"]', interessado.strip().upper())
    else:
        raise ErroSipac("Informe um número de processo ou o nome do interessado.")

    async with page.expect_navigation(wait_until="domcontentloaded"):
        await page.click('[id="processoForm:b_buscar_processo"]')
    await _checar_login(page)
    resultados, msgs = await page.evaluate(JS_RESULTADOS), await page.evaluate(JS_MENSAGENS)
    if interessado and resultados and conhecidos is not None:
        faltam = [{"numero": r["numero"], "linkId": r["linkId"], "idProcesso": r["idProcesso"]}
                  for r in resultados if r["numero"] not in conhecidos and not r.get("detalhado")
                  and r.get("idProcesso")][:MAX_ASSUNTOS]  # plano B: só quando a lista não trouxe o assunto
        if faltam:
            try:
                info = await page.evaluate(JS_ASSUNTOS, {"itens": faltam, "conc": 4, "prazo": 25000})
            except Exception:
                info = {}
            for r in resultados:
                if r["numero"] in info:
                    r.update(info[r["numero"]])
    return resultados, msgs


async def detalhar(page, numero: str):
    """Abre o processo (busca pelo número) e extrai dados, documentos e movimentações."""
    validar_numero(numero)
    resultados, msgs = await buscar(page, numero=numero)
    if not resultados:
        raise ErroSipac("; ".join(msgs) or "Processo não encontrado.")
    r = resultados[0]
    params = {r["linkId"]: r["linkId"], "idProcesso": r["idProcesso"], "popup": "true"}
    async with page.expect_navigation(wait_until="domcontentloaded"):
        # target '' -> abre na própria aba em vez do popup
        await page.evaluate(
            "(p) => jsfcljs(document.getElementById('processoForm'), p, '')", params)
    await _checar_login(page)
    await page.wait_for_selector("table.formulario caption")

    geral = await page.evaluate(JS_DADOS_GERAIS)
    try:
        await page.wait_for_selector('[id="processoForm:documentosProcesso"]', timeout=8000)
        documentos = await page.evaluate(JS_DOCUMENTOS)
    except Exception:
        documentos = []

    movimentos = []
    if await page.evaluate(JS_ABA, "Movimentações"):
        try:
            await page.wait_for_selector('[id="processoForm:tableMovimentos"]', timeout=10000)
            movimentos = await page.evaluate(JS_MOVIMENTOS)
        except Exception:
            pass

    return {
        "numero": r["numero"], "idProcesso": r["idProcesso"], "situacao": r["situacao"],
        "interessados": r.get("interessados", ""),
        "localAtual": r["localAtual"], **geral,
        "documentos": documentos, "movimentacoes": movimentos,
    }
