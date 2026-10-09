// Armazenamento local (chrome.storage.local) e textos de LGPD.
// Nada aqui sai do navegador.

export const VERSAO_TERMOS = '1.2';
export const VERSAO_AVISO_IA = '1.0';
export const VERSAO_AVISO_RESTRITOS = '1.0';

export const IA_PADRAO = {
  ativa: false, provedor: 'gemini', chaves: {}, modelos: {}, maxDocs: 6,
  aceite: null, permitirRestritos: false, aceiteRestritos: null,
};

/** Cópia em memória do storage, com gravação imediata. */
export const S = {};
export async function carregar() {
  Object.assign(S, await chrome.storage.local.get(null));
  S.ia = { ...IA_PADRAO, ...(S.ia || {}) };
  return S;
}
export async function salvar(chave, valor) {
  S[chave] = valor;
  await chrome.storage.local.set({ [chave]: valor });
}
export const agoraISO = () => new Date().toISOString();
export const termosAceitos = () => S.termos && S.termos.versao === VERSAO_TERMOS;
export const iaPronta = () => {
  const ia = S.ia || {};
  return ia.ativa && ia.aceite && ia.aceite.versao === VERSAO_AVISO_IA && !!(ia.chaves || {})[ia.provedor];
};

// ------------------------------------------------------------------ textos

export const TERMOS_HTML = `
<h2>Termo de uso e privacidade do Sigo</h2>
<p class="cinza peq">Versão ${VERSAO_TERMOS}</p>
<ol>
  <li>O Sigo é uma ferramenta gratuita e independente, desenvolvida por André Lage Freitas. Ele não tem vínculo oficial com a UFAL, com a UFRN nem com os sistemas SIG.</li>
  <li>O Sigo funciona só no seu navegador, com a sua sessão no SIG. Por isso, ele acessa apenas o que você já pode acessar com o seu login.</li>
  <li>O Sigo não tem servidor e não coleta dados. Dessa forma, o desenvolvedor não recebe nem armazena seus dados, os dados dos processos ou a sua chave de IA.</li>
  <li>Os dados dos processos são tratados pela sua instituição. Você continua responsável por usá-los conforme a LGPD (Lei 13.709/2018), as normas da sua instituição e o grau de sigilo de cada processo.</li>
  <li>A IA é opcional e vem desligada. Quando você a ativa, o conteúdo vai direto para o provedor que você escolheu, com a sua conta e sob os termos desse provedor. Portanto, cabe a você decidir o que enviar.</li>
  <li>Respostas de IA podem conter erros. Por isso, confira sempre o documento original antes de tomar qualquer decisão.</li>
  <li>O Sigo é fornecido "no estado em que se encontra", sem garantia de funcionamento contínuo ou de exatidão. Assim, na extensão permitida pela lei, o desenvolvedor não responde por decisões, perdas ou incidentes decorrentes do uso.</li>
  <li>Se você não concordar com estes termos, basta remover a extensão.</li>
</ol>`;

export const AVISO_IA_HTML = `
<h2>Antes de ativar a IA</h2>
<p>Ao usar a IA, trechos ou documentos inteiros do processo saem do seu navegador e vão para o provedor escolhido (Google, Anthropic ou OpenAI). Esses dados podem incluir nomes, CPFs e outras informações pessoais. Além disso, o provedor trata o conteúdo conforme os termos da sua conta, o que pode incluir armazenamento temporário.</p>
<p>Você é responsável por verificar se a sua instituição permite esse envio. Por isso, evite enviar processos sigilosos ou com dados sensíveis.</p>`;

export const AVISO_RESTRITOS_HTML = `
<h2>Permitir IA em processos restritos ou sigilosos</h2>
<p>Por padrão, o Sigo não envia à IA processos e documentos marcados pelo SIPAC como restritos ou sigilosos. Ao desbloquear, o conteúdo desses processos também poderá sair do seu navegador para o provedor escolhido.</p>
<p>Use esta opção só se a sua instituição autorizar o envio e se você tiver base legal para isso. A responsabilidade pelo envio é sua.</p>`;
