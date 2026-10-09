# Sigo — extensão do Chrome

Consulta e acompanhamento de processos do SIPAC/UFAL, com resumo opcional por IA usando a chave do próprio usuário.
Gratuito e de código aberto (licença MIT).

## Instalar (modo desenvolvedor)

1. Abra `chrome://extensions` e ligue o **Modo do desenvolvedor**, no canto superior direito.
2. Clique em **Carregar sem compactação** e escolha esta pasta (`extensao`).
3. Fixe o ícone do Sigo na barra do Chrome. Um clique nele abre o Sigo numa aba (ou volta para a aba do Sigo, se já estiver aberta). O painel lateral continua disponível pelo menu de painéis laterais do Chrome.

Depois de mudar o código, clique em **Recarregar** no cartão do Sigo em `chrome://extensions`.

## Usar

1. Entre no SIPAC normalmente, numa aba do Chrome. O Sigo nunca pede nem vê a sua senha.
2. Abra o Sigo e aceite os termos de uso na primeira vez.
3. Digite um número (`23065.029470/2026-43`) ou o nome do interessado.

Para fazer as consultas, o Sigo abre uma **aba de trabalho do SIPAC**, sem foco. Ela é reaproveitada e fecha sozinha após 5 minutos sem uso.
No painel lateral, o botão ↗ abre o Sigo numa aba.

## IA (opcional)

Em **Configurações** (engrenagem):

1. Ligue **Usar IA no Sigo** e aceite o aviso de envio de dados.
2. Escolha o provedor (Gemini, Claude ou GPT), cole a sua chave e clique em **Salvar**. O Chrome pede permissão para acessar só o site desse provedor.
3. **Testar chave** lista os modelos disponíveis na sua conta.

A IA lê os últimos documentos do processo (6 por padrão) e mostra a situação, o próximo passo, o que depende de você e uma mensagem para destravar o processo.
Processos e documentos que o SIPAC marca como **restritos ou sigilosos** não vão para a IA, a menos que você libere isso nas configurações, com aceite próprio.

## Privacidade

- Sem servidor e sem coleta de dados. Favoritos, histórico, resumos e chaves ficam só em `chrome.storage.local`.
- Sem IA, nenhum dado de processo sai do navegador. Com IA, o conteúdo vai direto para o provedor escolhido.
- Permissões fixas: `sidePanel`, `storage`, `scripting` e acesso a `sipac.sig.ufal.br`. Os domínios de IA são permissões opcionais.
- Textos de LGPD: `lib/config.js`. Política de privacidade: `PRIVACIDADE.md`.

## Estrutura

| Arquivo | Papel |
|---|---|
| `manifest.json` | Manifest V3 |
| `painel.html/js` | Interface (painel lateral ou aba) |
| `opcoes.html/js` | Configurações de IA e privacidade |
| `lib/sipac.js` | Orquestra a aba de trabalho do SIPAC (uma operação por vez, via Web Locks) |
| `lib/pagina.js` | Funções que rodam dentro da página do SIPAC. **Se o SIPAC mudar de tela, ajuste aqui.** |
| `lib/processo.js` | Cálculos sem IA: onde está, dias parado, mudanças, bloqueio de restritos |
| `lib/ia.js` | Provedores de IA (Gemini, Claude, OpenAI) e o formato da resposta |
| `lib/nup.js` | Validação do número do processo (DV módulo 11) |
| `lib/config.js` | Armazenamento local e textos de LGPD |

## Testes

```bash
npm test                                   # lógica, NUP e provedores de IA (Node 20+)
npm i -D playwright && node tests/e2e/extensao.e2e.mjs   # extensão real no Chromium, contra um SIPAC simulado
```

O teste ponta a ponta usa `tests/e2e/mock.mjs`, que imita o HTML mapeado do SIPAC v5.9.1.
