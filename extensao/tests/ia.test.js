import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerar } from '../lib/ia.js';

const proc = { numero: '23065.029470/2026-43', dados: {}, movimentacoes: [], documentos: [] };
const itens = [{ rotulo: 'doc. 1', texto: 'texto' }, { rotulo: 'doc. 2', pdf: 'JVBERi0=' }];
const saida = { manchete: 'ok' };
let ultima;
globalThis.chrome = { permissions: { contains: async () => true } };
const responder = corpo => { globalThis.fetch = async (url, opt) => { ultima = { url, opt, body: JSON.parse(opt.body) }; return new Response(JSON.stringify(corpo), { status: 200 }); }; };

test('Gemini: PDF inline e JSON estruturado', async () => {
  responder({ candidates: [{ content: { parts: [{ text: JSON.stringify(saida) }] } }] });
  const r = await gerar({ provedor: 'gemini', chave: 'k' }, proc, itens);
  assert.equal(r.manchete, 'ok');
  assert.match(ultima.url, /gemini-flash-latest:generateContent/);
  assert.equal(ultima.opt.headers['x-goog-api-key'], 'k');
  assert.ok(ultima.body.contents[0].parts.some(p => p.inline_data));
  assert.ok(!JSON.stringify(ultima.body.generationConfig.responseSchema).includes('additionalProperties'));
});
test('Claude: documento PDF e ferramenta forçada', async () => {
  responder({ content: [{ type: 'tool_use', input: saida }] });
  const r = await gerar({ provedor: 'claude', chave: 'k', modelo: 'm' }, proc, itens);
  assert.equal(r.manchete, 'ok');
  assert.equal(ultima.opt.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(ultima.body.tool_choice.name, 'registrar_acompanhamento');
  assert.ok(ultima.body.messages[0].content.some(c => c.type === 'document'));
});
test('OpenAI: arquivo PDF e json_schema estrito', async () => {
  responder({ choices: [{ message: { content: JSON.stringify(saida) } }] });
  const r = await gerar({ provedor: 'openai', chave: 'k' }, proc, itens);
  assert.equal(r.manchete, 'ok');
  assert.equal(ultima.opt.headers.Authorization, 'Bearer k');
  assert.equal(ultima.body.response_format.json_schema.strict, true);
  assert.ok(ultima.body.messages[1].content.some(c => c.type === 'file'));
});
test('Chave recusada vira mensagem clara', async () => {
  globalThis.fetch = async () => new Response('{"error":{"message":"invalid"}}', { status: 401 });
  await assert.rejects(gerar({ provedor: 'openai', chave: 'x' }, proc, itens), /Chave recusada/);
});

import { normalizar } from '../lib/ia.js';
test('saída da IA é normalizada e e-mail fora dos contatos do SIPAC é descartado', () => {
  const p = { movimentacoes: [{ ordem: '1', destino: 'X', enviadoEm: '01/09/2026', enviadoPor: 'ANA', contatoEnvio: { email: 'ana@ufal.br', telefone: '(82) 3214-0000' } }] };
  const r1 = normalizar({ etapas: 'x', alertas: [1, 2], mensagem: { email: 'golpe@mal.com', telefone: '999' } }, p);
  assert.deepEqual(r1.etapas, []);
  assert.deepEqual(r1.alertas, ['1', '2']);
  assert.equal(r1.mensagem.email, '');
  assert.equal(r1.mensagem.telefone, '');
  const r2 = normalizar({ mensagem: { email: 'ANA@ufal.br', telefone: '82 3214 0000' } }, p);
  assert.equal(r2.mensagem.email, 'ana@ufal.br');
  assert.equal(r2.mensagem.telefone, '82 3214 0000');
});
