import { chromium } from 'playwright';
import { rotear, logado } from './mock.mjs';
const EXT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const ctx = await chromium.launchPersistentContext('/tmp/sigo-e2e-perfil', {
  headless: true, channel: 'chromium',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 480, height: 900 },
});
await ctx.route('https://sipac.sig.ufal.br/**', r => { 
  const corpo = rotear(r.request().url());
  const pdf = corpo.startsWith('%PDF');
  r.fulfill({ status: 200, contentType: pdf ? 'application/pdf' : 'text/html; charset=utf-8', body: corpo });
});
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const id = sw.url().split('/')[2];
const pg = await ctx.newPage();
const erros = []; pg.on('pageerror', e => erros.push(e.message)); pg.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
await pg.goto(`chrome-extension://${id}/painel.html`);
await pg.waitForSelector('#chkTermos');
await pg.screenshot({ path: '/tmp/sigo-e2e-1-termos.png' });
await pg.check('#chkTermos'); await pg.click('#btnAceitar');
await pg.waitForSelector('#q');
// busca por número
await pg.fill('#q', '23065.029470/2026-44'); await pg.click('#btnBuscar');
console.log('DV errado ->', await pg.textContent('#saida'));
await pg.fill('#q', '23065.029470/2026-43'); await pg.click('#btnBuscar');
await pg.waitForSelector('#vProc h1', { timeout: 60000 });
console.log('Título:', await pg.textContent('#vProc h1'));
console.log('Abas:', (await pg.$$eval('#vProc .aba', a => a.map(x => x.textContent))).join(' | '));
console.log('IA CTA:', (await pg.textContent('#secIA')).replace(/\s+/g, ' ').trim().slice(0, 90));
await pg.screenshot({ path: '/tmp/sigo-e2e-2-processo.png', fullPage: true });
await pg.click('#btnFav');
// busca por nome
await pg.click('nav.vistas button[data-v=buscar]');
await pg.fill('#q', 'Maria da Silva'); await pg.click('#btnBuscar');
await pg.waitForSelector('#listaRes', { timeout: 60000 });
console.log('Lista:', await pg.textContent('#nRes'));
await pg.screenshot({ path: '/tmp/sigo-e2e-3-lista.png', fullPage: true });
// acompanhar
await pg.click('nav.vistas button[data-v=acomp]');
await pg.waitForFunction(() => !document.querySelector('#btnVerificar')?.disabled, null, { timeout: 60000 });
console.log('Acompanhar:', (await pg.textContent('#vAcomp')).replace(/\s+/g, ' ').trim().slice(0, 160));
await pg.screenshot({ path: '/tmp/sigo-e2e-4-acomp.png', fullPage: true });
// sessão caída
logado.v = false;
await pg.click('nav.vistas button[data-v=buscar]');
await pg.fill('#q', '23065.029470/2026-43'); await pg.click('#btnBuscar');
await pg.waitForSelector('[data-login]', { timeout: 60000 });
console.log('Sem sessão:', (await pg.textContent('#vProc .aviso')).replace(/\s+/g, ' ').trim());
logado.v = true;
// IA: baixa documentos (testa filtro de restritos) chamando o módulo direto na página
const docs = await pg.evaluate(async () => {
  const s = await import('./lib/sipac.js');
  const { ehRestrito } = await import('./lib/processo.js');
  const p = await s.detalhar('23065.029470/2026-43');
  const r = await s.baixarDocumentos(p.documentos, { aceitar: d => !ehRestrito(d.natureza) });
  return { log: r.log, itens: r.itens.map(i => ({ rotulo: i.rotulo, tipo: i.pdf ? 'pdf' : 'texto', texto: i.texto })), movs: p.movimentacoes.length, contato: (p.movimentacoes[1]||{}).contatoEnvio };
});
console.log('Docs IA:', JSON.stringify(docs));
// opções
const op = await ctx.newPage();
op.on('pageerror', e => erros.push('opcoes: ' + e.message));
await op.goto(`chrome-extension://${id}/opcoes.html`);
await op.click('#ativa'); await op.waitForSelector('#chkAceite');
await op.screenshot({ path: '/tmp/sigo-e2e-5-aviso-ia.png' });
await op.check('#chkAceite'); await op.click('#btnOk');
await op.waitForTimeout(300);
console.log('IA ativa:', await op.evaluate(async () => (await chrome.storage.local.get('ia')).ia));
await op.screenshot({ path: '/tmp/sigo-e2e-6-opcoes.png', fullPage: true });
const abas = ctx.pages().map(p => p.url());
console.log('Abas abertas:', abas);
console.log('ERROS:', erros);
await ctx.close();
