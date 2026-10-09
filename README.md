# Sigo — consulta e acompanhamento de processos do SIPAC

> **Novo:** o Sigo também existe como extensão do Chrome, na pasta [`extensao/`](extensao/README.md). Ela usa a sessão do SIPAC aberta no próprio Chrome e dispensa Python, Playwright e `secret.env`.

Frontend simples para consultar processos do SIPAC/UFAL (somente leitura).

## Instalar (uma vez)

```bash
cd sig-capa
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium   # opcional: só se o Google Chrome não estiver instalado
```

## Credenciais (opcional)

Crie `secret.env` na pasta do projeto (já está no `.gitignore`):

```
SIPAC_USUARIO=seu_login
SIPAC_SENHA=sua_senha
```

O arquivo é lido só localmente, pelo `app.py`.

Para o resumo com IA, acrescente (opcional):

```
GEMINI_API_KEY=sua_chave        # Gemini (os documentos são enviados ao Google)
GEMINI_MODELO=gemini-flash-latest
IA_PROVEDOR=gemini              # ou ollama (tudo local)
OLLAMA_MODELO=qwen3:8b          # usado se o Gemini falhar ou se IA_PROVEDOR=ollama
```

## Usar

```bash
source .venv/bin/activate
python app.py
```

1. O Sigo abre no seu navegador em http://127.0.0.1:8765.
2. Login: se existir `secret.env` na pasta, o app entra sozinho, com o Chrome do SIPAC invisível
   (e entra de novo quando a sessão expira). Sem ele, aparece uma janela do Chrome para o login manual.
   Para ver a janela mesmo com `secret.env`: `SIG_CAPA_JANELA=1 python app.py`.
3. No Sigo, digite um número (`23065.029470/2026-43`) ou o nome do interessado.

A sessão do SIPAC expira após cerca de 1h30 sem uso; com `secret.env`, o app entra de novo sozinho.

## O que faz

- Busca por número → abre o processo direto.
- Busca por nome do interessado → lista processos com situação e última movimentação.
- Detalhe: dados gerais, documentos (abre o PDF) e movimentações em linha do tempo.
- **Onde está agora** (sem IA): unidade atual, se já foi recebido, há quantos dias está lá e alerta de parado (> 15 dias).
- **Resumir com IA**: lê as movimentações e os 6 últimos documentos. Mostra a situação atual, a próxima ação,
  o que depende de você (com prazo, se houver), os alertas e as etapas. O resumo fica em cache até o processo mudar.
- **Acompanhar**: verifica todos os favoritos de uma vez e mostra o que mudou desde a última verificação
  (nova unidade, recebimento, novo documento, nova situação). O histórico fica em `~/.sig-capa/`.
- Favoritos e buscas recentes ficam salvos no navegador.

## Como funciona

`sipac.py` reproduz o caminho Portal Admin. > Protocolo > Processos > Consultar Processo,
preenche o formulário e lê as tabelas. `app.py` expõe isso em `localhost` via FastAPI.
Se o SIPAC mudar de tela, os seletores ficam concentrados em `sipac.py`.

Documentos criados direto no SIPAC ("Documento Virtual Escrito", ex.: despachos, TRD) abrem na versão de impressão.
Para salvar em PDF, use Imprimir > Salvar como PDF.

## Licença

Código aberto sob a [licença MIT](LICENSE). © 2026 André Lage Freitas.
