import { PROVEDORES, testarChave } from './lib/ia.js';
import {
  S, carregar, salvar, agoraISO, IA_PADRAO, TERMOS_HTML, AVISO_IA_HTML, AVISO_RESTRITOS_HTML,
  VERSAO_AVISO_IA, VERSAO_AVISO_RESTRITOS,
} from './lib/config.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ia = () => S.ia;
const gravarIA = mud => salvar('ia', { ...S.ia, ...mud });
const provedor = () => document.querySelector('input[name=prov]:checked').value;

function msg(texto, ok) { const m = $('#msgChave'); m.textContent = texto; m.className = 'peq ' + (ok ? 'ok' : ok === false ? 'ruim' : ''); }

function abrirModal(html) { $('#caixa').innerHTML = html; $('#modal').hidden = false; }
function fecharModal() { $('#modal').hidden = true; $('#caixa').innerHTML = ''; }

/** Mostra um aviso com caixa de aceite. Resolve true se aceito. */
function pedirAceite(html, rotulo) {
  return new Promise(resolve => {
    abrirModal(`${html}
      <label class="aceite"><input type="checkbox" id="chkAceite"> ${esc(rotulo)}</label>
      <div class="acoes"><button class="btn" id="btnCancelar">Cancelar</button><button class="btn pri" id="btnOk" disabled>Confirmar</button></div>`);
    $('#chkAceite').onchange = e => { $('#btnOk').disabled = !e.target.checked; };
    $('#btnCancelar').onclick = () => { fecharModal(); resolve(false); };
    $('#btnOk').onclick = () => { fecharModal(); resolve(true); };
  });
}

function renderProvedores() {
  $('#provs').innerHTML = Object.entries(PROVEDORES).map(([id, p]) =>
    `<label class="prov"><input type="radio" name="prov" value="${id}" ${ia().provedor === id ? 'checked' : ''}> ${esc(p.nome)}</label>`).join('');
  document.querySelectorAll('input[name=prov]').forEach(r => r.onchange = () => { preencherProvedor(r.value); msg(''); });
}
function preencherProvedor(id) {
  const p = PROVEDORES[id];
  $('#chave').value = (ia().chaves || {})[id] || '';
  $('#modelo').value = (ia().modelos || {})[id] || p.modeloPadrao;
  $('#modelo').placeholder = p.modeloPadrao;
  $('#lnkChave').href = p.chaveUrl;
  $('#listaModelos').innerHTML = '';
}
function renderAceites() {
  const t = [];
  if (S.termos) t.push(`Termos de uso aceitos em ${new Date(S.termos.em).toLocaleString('pt-BR')} (versão ${S.termos.versao}).`);
  if (ia().aceite) t.push(`Aviso de IA aceito em ${new Date(ia().aceite.em).toLocaleString('pt-BR')}.`);
  if (ia().aceiteRestritos && ia().permitirRestritos) t.push(`Aviso de processos restritos aceito em ${new Date(ia().aceiteRestritos.em).toLocaleString('pt-BR')}.`);
  $('#infoAceites').textContent = t.join(' ');
}
function render() {
  $('#ativa').checked = !!ia().ativa;
  $('#secProvedor').style.opacity = ia().ativa ? '' : '.6';
  $('#maxDocs').value = ia().maxDocs || 6;
  $('#restritos').checked = !!ia().permitirRestritos;
  renderProvedores();
  preencherProvedor(ia().provedor);
  renderAceites();
}

// --------------------------------------------------------------- ações

$('#ativa').onchange = async e => {
  if (e.target.checked) {
    const aceito = (ia().aceite && ia().aceite.versao === VERSAO_AVISO_IA)
      || await pedirAceite(AVISO_IA_HTML, 'Entendo e assumo a responsabilidade pelos envios que eu fizer.');
    if (!aceito) { e.target.checked = false; return; }
    await gravarIA({ ativa: true, aceite: ia().aceite && ia().aceite.versao === VERSAO_AVISO_IA ? ia().aceite : { versao: VERSAO_AVISO_IA, em: agoraISO() } });
  } else {
    await gravarIA({ ativa: false });
  }
  render();
};

$('#btnVer').onclick = () => {
  const c = $('#chave'); c.type = c.type === 'password' ? 'text' : 'password';
  $('#btnVer').textContent = c.type === 'password' ? 'Mostrar' : 'Ocultar';
};

// O pedido de permissão precisa sair direto do clique (antes de qualquer await).
function pedirPermissao(id) {
  return chrome.permissions.request({ origins: [PROVEDORES[id].origem] });
}

$('#btnSalvar').onclick = () => {
  const id = provedor(), chave = $('#chave').value.trim(), modelo = $('#modelo').value.trim();
  const perm = chave ? pedirPermissao(id) : Promise.resolve(true);
  perm.then(async ok => {
    await gravarIA({
      provedor: id,
      chaves: { ...(ia().chaves || {}), [id]: chave },
      modelos: { ...(ia().modelos || {}), [id]: modelo || PROVEDORES[id].modeloPadrao },
    });
    if (!ok) msg('Salvo, mas o Chrome não autorizou o acesso ao provedor. Clique em Salvar de novo e aceite.', false);
    else msg(chave ? 'Salvo ✓' : 'Salvo (sem chave).', true);
  }).catch(e => msg(e.message, false));
};

$('#btnTestar').onclick = () => {
  const id = provedor(), chave = $('#chave').value.trim();
  if (!chave) { msg('Cole a chave antes de testar.', false); return; }
  pedirPermissao(id).then(async ok => {
    if (!ok) { msg('O Chrome não autorizou o acesso ao provedor.', false); return; }
    msg('Testando…');
    try {
      const modelos = await testarChave(id, chave);
      $('#listaModelos').innerHTML = modelos.map(m => `<option value="${esc(m)}">`).join('');
      const atual = $('#modelo').value.trim();
      const aviso = atual && modelos.length && !modelos.includes(atual) ? ` O modelo "${atual}" não aparece na lista da sua conta; escolha um da lista.` : '';
      msg(`Chave válida ✓ (${modelos.length} modelos disponíveis).${aviso}`, !aviso);
    } catch (e) { msg(e.message, false); }
  });
};

$('#btnApagar').onclick = async () => {
  const id = provedor();
  const chaves = { ...(ia().chaves || {}) }; delete chaves[id];
  await gravarIA({ chaves });
  try { await chrome.permissions.remove({ origins: [PROVEDORES[id].origem] }); } catch (e) { /* já removida */ }
  $('#chave').value = '';
  msg('Chave apagada deste navegador.', true);
};

$('#maxDocs').onchange = async e => {
  const n = Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 6));
  e.target.value = n;
  await gravarIA({ maxDocs: n });
};

$('#restritos').onchange = async e => {
  if (e.target.checked) {
    const ok = await pedirAceite(AVISO_RESTRITOS_HTML, 'Tenho autorização para esse envio e assumo a responsabilidade por ele.');
    if (!ok) { e.target.checked = false; return; }
    await gravarIA({ permitirRestritos: true, aceiteRestritos: { versao: VERSAO_AVISO_RESTRITOS, em: agoraISO() } });
  } else {
    await gravarIA({ permitirRestritos: false });
  }
  renderAceites();
};

$('#btnTermos').onclick = () => {
  abrirModal(`${TERMOS_HTML}<div class="acoes"><button class="btn" id="btnFechar">Fechar</button></div>`);
  $('#btnFechar').onclick = fecharModal;
};

$('#btnLimpar').onclick = async () => {
  abrirModal(`<h2>Apagar todos os dados do Sigo?</h2>
    <p>Isso remove deste navegador os favoritos, o histórico de acompanhamento, os resumos, as chaves de IA e os aceites. Na próxima abertura, o Sigo pedirá o aceite dos termos de novo.</p>
    <div class="acoes"><button class="btn" id="btnNao">Cancelar</button><button class="btn pri" id="btnSim">Apagar tudo</button></div>`);
  $('#btnNao').onclick = fecharModal;
  $('#btnSim').onclick = async () => {
    await chrome.storage.local.clear();
    try { await chrome.permissions.remove({ origins: Object.values(PROVEDORES).map(p => p.origem) }); } catch (e) { /* ok */ }
    for (const k of Object.keys(S)) delete S[k];
    S.ia = { ...IA_PADRAO };
    fecharModal(); render(); msg('');
  };
};

// --------------------------------------------------------------- voltar ao Sigo
// Se já houver uma aba do Sigo, volta para ela e fecha esta; senão, esta aba vira o Sigo.
async function voltarAoSigo() {
  const PAINEL = chrome.runtime.getURL('painel.html');
  try {
    const atual = await chrome.tabs.getCurrent();
    const ctx = await chrome.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [PAINEL] });
    const outra = ctx.find(c => c.tabId >= 0 && (!atual || c.tabId !== atual.id));
    if (outra) {
      await chrome.tabs.update(outra.tabId, { active: true });
      await chrome.windows.update(outra.windowId, { focused: true });
      if (atual) await chrome.tabs.remove(atual.id);
      return;
    }
  } catch (e) { /* segue para abrir aqui */ }
  location.href = PAINEL;
}
$('#btnVoltarSigo').onclick = voltarAoSigo;
$('#btnVoltarSigo2').onclick = voltarAoSigo;

(async () => { await carregar(); render(); })();
