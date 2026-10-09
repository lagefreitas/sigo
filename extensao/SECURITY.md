# Segurança

## Como relatar uma vulnerabilidade

Não abra uma *issue* pública. Envie os detalhes por e-mail para andre.lage@ichca.ufal.br, com os passos para reproduzir o problema. A resposta inicial deve chegar em até 7 dias.

## Modelo de segurança do Sigo

- O Sigo não tem servidor. Nenhum dado sai do navegador, exceto quando o usuário ativa a IA; nesse caso, o conteúdo vai direto para o provedor escolhido.
- O Sigo usa a sessão do SIPAC aberta pelo próprio usuário e nunca lê nem guarda a senha.
- As funções que leem o SIPAC rodam no mundo isolado da extensão. Só a abertura da ficha usa o mundo da página, porque depende da função `jsfcljs` do SIPAC.
- Todo conteúdo vindo do SIPAC ou da IA é escapado antes de ir para a tela. A resposta da IA é normalizada, e e-mails e telefones sugeridos só aparecem se constarem nos contatos do SIPAC.
- Processos restritos, sigilosos ou sem natureza informada não vão para a IA, salvo liberação explícita do usuário.
- A chave de IA fica em `chrome.storage.local`, sem criptografia, acessível apenas às páginas da própria extensão. Recomenda-se usar uma chave exclusiva para o Sigo, com limite de gasto.
