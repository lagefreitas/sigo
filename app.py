"""Sigo — frontend simples sobre o SIPAC/UFAL.

Uso:  python app.py   ->  abre http://127.0.0.1:8765
Uma janela do Chrome controlada pelo app é aberta; faça login nela.
A senha nunca passa pelo app: ela é digitada direto no SIPAC.
"""
import asyncio
import json
import os
import re
import webbrowser
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import quote

from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse, Response
from playwright.async_api import async_playwright

import resumo
import sipac

PORTA = int(os.environ.get("SIG_CAPA_PORTA", "8765"))
DADOS = Path.home() / ".sig-capa"
PERFIL = DADOS / "perfil-chrome"
RESUMOS = DADOS / "resumos.json"
ACOMP = DADOS / "acompanhamento.json"
ASSUNTOS = DADOS / "assuntos.json"  # cache: nº do processo -> assunto, assunto detalhado, autuação
STATIC = Path(__file__).parent / "static"

SECRET = Path(__file__).parent / "secret.env"

estado = {}
trava = asyncio.Lock()  # o SIPAC é stateful: uma operação por vez


CHAVES_IA = ("GEMINI_", "OLLAMA_", "IA_")


def ler_env() -> dict:
    """Todas as chaves CHAVE=valor do secret.env (para a configuração da IA)."""
    cfg = {}
    if SECRET.exists():
        for linha in SECRET.read_text(encoding="utf-8-sig").splitlines():
            m = re.match(r"^\s*(?:export\s+)?([A-Za-z_][\w.-]*)\s*[=:]\s*(.*)$", linha)
            if m and not linha.strip().startswith("#"):
                cfg[m.group(1).upper()] = m.group(2).strip().strip('"').strip("'")
    return cfg


def _ler_json(p: Path) -> dict:
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _gravar_json(p: Path, d: dict):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")


def carregar_credenciais():
    """Lê usuário e senha do secret.env. Aceita:
      CHAVE=valor ou CHAVE: valor (chaves com USUARIO/LOGIN/USER e SENHA/PASSWORD), ou
      só duas linhas (1ª = usuário, 2ª = senha).
    Nunca imprime os valores."""
    if not SECRET.exists():
        print("secret.env: arquivo não encontrado em", SECRET.parent, "-> login manual")
        return None
    texto = SECRET.read_text(encoding="utf-8-sig")
    linhas = [l.strip() for l in texto.splitlines() if l.strip() and not l.strip().startswith("#")]
    usuario = senha = None
    chaves = []
    for linha in linhas:
        m = re.match(r"^(?:export\s+)?([A-Za-z_][\w.-]*)\s*[=:]\s*(.*)$", linha)
        if not m:
            continue
        k, v = m.group(1).upper(), m.group(2).strip().strip('"').strip("'")
        if k.startswith(CHAVES_IA):
            continue
        chaves.append(k)
        if any(t in k for t in ("SENHA", "PASS", "PWD")):
            senha = v
        elif any(t in k for t in ("USU", "LOGIN", "USER", "CPF", "SIAPE")):
            usuario = v
    if not chaves and len(linhas) >= 2:  # formato simples: usuário na 1ª linha, senha na 2ª
        usuario, senha = linhas[0], linhas[1]
        chaves = ["(linha 1)", "(linha 2)"]
    if usuario and senha:
        print(f"secret.env: credenciais carregadas (chaves: {', '.join(chaves)})")
        return usuario, senha
    print(f"secret.env: não reconheci usuário e senha (chaves vistas: {', '.join(chaves) or 'nenhuma'}).")
    print("  Use o formato:  SIPAC_USUARIO=seu_login  e  SIPAC_SENHA=sua_senha")
    return None


async def autologin(page) -> bool:
    cred = estado.get("cred")
    if not cred:
        return False
    try:
        ok = await sipac.fazer_login(page, *cred)
        print("Login automático:", "ok" if ok else "recusado pelo SIPAC (confira usuário/senha no secret.env)")
        return ok
    except Exception as e:
        print("Aviso: login automático falhou:", e)
        return False


async def com_relogin(fn):
    """Executa fn(page); se a sessão tiver expirado, loga de novo e tenta mais uma vez."""
    page = estado["page"]
    try:
        return await fn(page)
    except sipac.NaoLogado:
        if await autologin(page):
            return await fn(page)
        raise


@asynccontextmanager
async def ciclo(app):
    PERFIL.mkdir(parents=True, exist_ok=True)
    pw = await async_playwright().start()
    cred = carregar_credenciais()
    # Com login automático, o Chrome do SIPAC roda invisível. Sem credenciais, a janela aparece para o login manual.
    # SIG_CAPA_JANELA=1 força a janela visível (útil para depurar).
    invisivel = bool(cred) and os.environ.get("SIG_CAPA_JANELA") != "1"
    estado["invisivel"] = invisivel
    print("Chrome do SIPAC:", "invisível (login automático)" if invisivel else "janela visível")
    kw = dict(user_data_dir=str(PERFIL), headless=invisivel, viewport={"width": 1100, "height": 800})
    try:
        ctx = await pw.chromium.launch_persistent_context(channel="chrome", **kw)
    except Exception:
        ctx = await pw.chromium.launch_persistent_context(**kw)  # Chromium do Playwright
    page = ctx.pages[0] if ctx.pages else await ctx.new_page()
    page.set_default_timeout(30000)
    estado.update(pw=pw, ctx=ctx, page=page, cred=cred, cfg=ler_env())
    cfg = estado["cfg"]
    prov = (cfg.get("IA_PROVEDOR") or ("gemini" if cfg.get("GEMINI_API_KEY") else "ollama")).lower()
    print(f"IA: provedor principal = {prov}" + (" (chave do Gemini encontrada)" if cfg.get("GEMINI_API_KEY") else ""))
    try:
        if not await autologin(page):
            await page.goto(sipac.PORTAL, wait_until="domcontentloaded")
    except Exception as e:
        print("Aviso: não consegui abrir o SIPAC agora:", e)
    webbrowser.open(f"http://127.0.0.1:{PORTA}")
    yield
    await ctx.close()
    await pw.stop()


app = FastAPI(lifespan=ciclo)


def _erro(e: Exception):
    if isinstance(e, sipac.NaoLogado):
        return JSONResponse({"erro": str(e), "login": True}, status_code=401)
    if isinstance(e, sipac.ErroSipac):
        return JSONResponse({"erro": str(e)}, status_code=400)
    return JSONResponse({"erro": f"Falha inesperada: {e}"}, status_code=500)


@app.get("/")
async def index():
    return FileResponse(STATIC / "index.html")


@app.get("/api/status")
async def status():
    try:
        if await sipac.esta_logado(estado["ctx"]):
            return {"logado": True, "usuario": sipac.usuario_logado["nome"]}
        if estado.get("cred") and not trava.locked():
            async with trava:
                if await autologin(estado["page"]):
                    return {"logado": True, "relogado": True, "usuario": sipac.usuario_logado["nome"]}
        return {"logado": False}
    except Exception:
        return {"logado": False}


@app.post("/api/login")
async def login():
    """Traz a janela do SIPAC para frente para você fazer login."""
    async with trava:
        page = estado["page"]
        if await autologin(page):
            return {"ok": True, "automatico": True}
        if estado.get("invisivel"):
            return JSONResponse({"erro": "O login automático falhou. Confira usuário e senha no secret.env, "
                                 "ou rode com SIG_CAPA_JANELA=1 para entrar pela janela."}, status_code=401)
        await page.goto(sipac.BASE + "/sipac/", wait_until="domcontentloaded")
        await page.bring_to_front()
    return {"ok": True, "automatico": False}


@app.get("/api/buscar")
async def buscar(q: str = Query(..., min_length=3)):
    if sipac.parece_numero(q):
        try:
            sipac.validar_numero(q)
        except sipac.ErroSipac as e:
            return _erro(e)
    async with trava:
        try:
            if sipac.parece_numero(q):
                res, msgs = await com_relogin(lambda p: sipac.buscar(p, numero=q))
                return {"resultados": res, "mensagens": msgs}
            # O SIPAC compara o nome exatamente como cadastrado: o mesmo nome aparece com e sem acento.
            # Por isso buscamos as duas grafias e juntamos os resultados.
            res, msgs, vistos = [], [], set()
            cache = _ler_json(ASSUNTOS)
            for variante in sipac.variantes_nome(q):
                conhecidos = set(cache) | vistos
                r, m = await com_relogin(lambda p, v=variante, k=conhecidos: sipac.buscar(p, interessado=v, conhecidos=k))
                for x in r:
                    if x.get("assunto") or x.get("detalhado"):
                        antigo = cache.get(x["numero"]) or {}
                        cache[x["numero"]] = {k: x.get(k) or antigo.get(k, "") for k in ("assunto", "detalhado", "autuacao")}
                    if x["numero"] not in vistos:
                        vistos.add(x["numero"])
                        res.append(x)
                msgs += m
            for x in res:  # completa com o que já se sabia de buscas anteriores
                for k, v in (cache.get(x["numero"]) or {}).items():
                    if not x.get(k):
                        x[k] = v
            _gravar_json(ASSUNTOS, cache)
            return {"resultados": res, "mensagens": [] if res else sorted(set(msgs))}
        except Exception as e:
            return _erro(e)


@app.get("/api/processo")
async def processo(numero: str):
    try:
        sipac.validar_numero(numero)
    except sipac.ErroSipac as e:
        return _erro(e)
    async with trava:
        try:
            proc = await com_relogin(lambda p: sipac.detalhar(p, numero))
        except Exception as e:
            return _erro(e)
    proc["ondeEsta"] = resumo.onde_esta(proc)
    d = proc.get("dados") or {}
    if d.get("Assunto do Processo") or d.get("Assunto Detalhado"):
        cache = _ler_json(ASSUNTOS)
        cache[proc["numero"]] = {"assunto": d.get("Assunto do Processo", ""), "detalhado": d.get("Assunto Detalhado", ""),
                                 "autuacao": d.get("Data de Autuação", "")}
        _gravar_json(ASSUNTOS, cache)
    cache = _ler_json(RESUMOS).get(proc["numero"])
    if cache and cache.get("assinatura") == resumo.assinatura(proc):
        proc["resumoIA"] = cache["resumo"]  # resumo ainda válido: o processo não mudou
    return proc


@app.post("/api/resumo")
async def gerar_resumo(proc: dict = Body(...), forcar: bool = False):
    """Recebe o processo já detalhado (de /api/processo) e gera o resumo com IA."""
    try:
        sipac.validar_numero(proc.get("numero", ""))
    except sipac.ErroSipac as e:
        return _erro(e)
    try:
        return await _resumir(proc, forcar)
    except Exception as e:
        return JSONResponse({"erro": str(e)}, status_code=502)


trava_ia = asyncio.Lock()  # evita gravar o cache de resumos ao mesmo tempo


async def _resumir(proc: dict, forcar: bool = False) -> dict:
    """Devolve o resumo do cache se o processo não mudou; senão gera com IA e guarda."""
    assin = resumo.assinatura(proc)
    cache = _ler_json(RESUMOS)
    if not forcar and cache.get(proc["numero"], {}).get("assinatura") == assin:
        return cache[proc["numero"]]["resumo"]
    proc["_usuario"] = sipac.usuario_logado["nome"]
    itens, log = await resumo.coletar_documentos(estado["ctx"], sipac.BASE, proc.get("documentos") or [],
                                                 sipac.PREFIXOS_ARQUIVO)
    out = await asyncio.to_thread(resumo.gerar, estado["cfg"], proc, itens)
    out["_docsLidos"] = log
    out["_geradoEm"] = resumo.date.today().strftime("%d/%m/%Y")
    async with trava_ia:
        cache = _ler_json(RESUMOS)
        cache[proc["numero"]] = {"assinatura": assin, "resumo": out}
        _gravar_json(RESUMOS, cache)
    return out


def _ia_curta(r: dict) -> dict:
    """O essencial do resumo para o cartão do Acompanhar."""
    pa = r.get("proxima_acao") or {}
    return {"manchete": r.get("manchete") or r.get("situacao_atual", ""), "semaforo": r.get("semaforo") or {},
            "proxima": pa.get("o_que", ""), "quem": pa.get("quem", ""),
            "comVoce": [x.get("acao", "") for x in r.get("depende_de_mim") or []], "geradoEm": r.get("_geradoEm", "")}


def _trajeto(proc: dict, n: int = 5) -> list:
    """Últimas unidades por onde o processo passou, da mais antiga para a atual."""
    movs = sorted(proc.get("movimentacoes") or [],
                  key=lambda m: (resumo._data(m.get("enviadoEm")) or resumo.date.min, int(m.get("ordem") or 0)))
    return [{"unidade": m.get("destino", ""), "data": m.get("enviadoEm", "")} for m in movs[-n:]]


def _foto(proc: dict) -> dict:
    o = resumo.onde_esta(proc)
    docs = proc.get("documentos") or []
    return {
        "numero": proc["numero"],
        "assunto": (proc.get("dados") or {}).get("Assunto Detalhado") or (proc.get("dados") or {}).get("Assunto do Processo", ""),
        "situacao": o["situacao"], "unidade": o["unidade"], "recebido": o["recebido"],
        "enviadoEm": o["enviadoEm"], "recebidoEm": o["recebidoEm"], "diasNaUnidade": o["diasNaUnidade"],
        "parado": o["parado"], "nMovs": len(proc.get("movimentacoes") or []),
        "trajeto": _trajeto(proc),
        "docs": [f"{d.get('ordem')} - {d.get('tipo')} ({d.get('data')})" for d in docs],
    }


def _mudancas(antes: dict, agora: dict) -> list:
    if not antes:
        return []
    m = []
    antes = {**agora, **antes}  # tolera fotos antigas com menos campos
    if antes["unidade"] != agora["unidade"]:
        m.append(f"Mudou de unidade: {antes['unidade']} → {agora['unidade']}")
    elif not antes["recebido"] and agora["recebido"]:
        m.append(f"Foi recebido em {agora['recebidoEm']}")
    if antes["situacao"] != agora["situacao"]:
        m.append(f"Situação: {antes['situacao']} → {agora['situacao']}")
    novos = [d for d in agora["docs"] if d not in set(antes["docs"])]
    m += [f"Novo documento: doc. {d}" for d in novos]
    return m


@app.get("/api/acompanhar")
async def acompanhar(numero: str, resumir: bool = True):
    """Confere um processo e diz o que mudou desde a última verificação."""
    try:
        sipac.validar_numero(numero)
    except sipac.ErroSipac as e:
        return _erro(e)
    async with trava:
        try:
            proc = await com_relogin(lambda p: sipac.detalhar(p, numero))
        except Exception as e:
            return _erro(e)
    agora = _foto(proc)
    hist = _ler_json(ACOMP)
    antes = hist.get(proc["numero"], {}).get("foto")
    verificado_antes = hist.get(proc["numero"], {}).get("verificadoEm")
    mud = _mudancas(antes, agora)
    hist[proc["numero"]] = {"foto": agora, "verificadoEm": resumo.datetime.now().strftime("%d/%m/%Y %H:%M"),
                            "ultimasMudancas": mud or hist.get(proc["numero"], {}).get("ultimasMudancas", [])}
    _gravar_json(ACOMP, hist)
    ia, ia_erro = None, None
    if resumir:  # gera o resumo de IA se ainda não houver um válido para o estado atual do processo
        try:
            ia = _ia_curta(await _resumir(proc))
        except Exception as e:
            ia_erro = str(e)[:300]
    return {**agora, "mudancas": mud, "primeiraVez": antes is None, "ia": ia, "iaErro": ia_erro,
            "verificadoEm": hist[proc["numero"]]["verificadoEm"],
            "verificadoAntes": verificado_antes}


@app.get("/api/arquivo")
async def arquivo(u: str):
    """Repassa o arquivo de um documento usando a sessão logada."""
    if not u.startswith(sipac.PREFIXOS_ARQUIVO):
        raise HTTPException(400, "URL não permitida")
    r = await estado["ctx"].request.get(sipac.BASE + u)
    if not r.ok:
        raise HTTPException(r.status, "Falha ao baixar o documento")
    corpo = await r.body()
    tipo = r.headers.get("content-type", "application/octet-stream")
    if "text/html" in tipo:
        # documento escrito no SIPAC: página HTML de impressão. A tag <base> faz CSS e imagens carregarem do SIPAC.
        if b"type=\"password\"" in corpo or b"expirada" in r.url.encode():
            raise HTTPException(401, "Sessão do SIPAC expirada. Atualize o processo e tente de novo.")
        corpo = re.sub(rb"<head([^>]*)>", lambda m: m.group(0) + f'<base href="{sipac.BASE}/">'.encode(),
                       corpo, count=1, flags=re.I)
        return Response(corpo, media_type=tipo)
    nome = "documento.pdf"
    cd = r.headers.get("content-disposition", "")
    if "filename=" in cd:
        nome = cd.split("filename=")[-1].strip('"; ')
    return Response(corpo, media_type=tipo,
                    headers={"Content-Disposition": f"inline; filename*=UTF-8''{quote(nome)}"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=PORTA, log_level="warning")
