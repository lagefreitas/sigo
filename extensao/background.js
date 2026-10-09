// O clique no ícone abre o Sigo numa aba. Se já houver uma aba do Sigo, ela é trazida para frente.
const PAINEL = chrome.runtime.getURL('painel.html');

function configurar() {
  // O painel lateral continua disponível pelo menu de painéis do Chrome, mas o ícone abre a aba.
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
}
chrome.runtime.onInstalled.addListener(configurar);
chrome.runtime.onStartup.addListener(configurar);

async function abrirAbaSigo() {
  const ctx = await chrome.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [PAINEL] }).catch(() => []);
  const existente = ctx.find(c => c.tabId >= 0);
  if (existente) {
    await chrome.tabs.update(existente.tabId, { active: true });
    await chrome.windows.update(existente.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url: PAINEL });
}
chrome.action.onClicked.addListener(() => { abrirAbaSigo(); });
self.abrirAbaSigo = abrirAbaSigo;  // usado nos testes
