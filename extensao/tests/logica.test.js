import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dvNup, validarNumero, erroNumero, pareceNumero } from '../lib/nup.js';
import { ondeEsta, mudancas, foto, processoRestrito, ehRestrito, assinatura } from '../lib/processo.js';
import { SCHEMA } from '../lib/ia.js';

test('DV do NUP confere com processos reais', () => {
  assert.equal(dvNup('230650294702026'), '43');
  assert.equal(dvNup('230650280722024'), '48');
  assert.equal(validarNumero('23065.029470/2026-43').formatado, '23065.029470/2026-43');
  assert.equal(validarNumero('23065029470202643').numero, '029470');
});
test('NUP inválido é recusado antes de consultar o SIPAC', () => {
  assert.match(erroNumero('23065.029470/2026-44'), /Dígito verificador/);
  assert.match(erroNumero('12345.029470/2026-43'), /Não é processo da UFAL/);
  assert.match(erroNumero('abc'), /Formato inválido/);
  assert.equal(pareceNumero('23065.029470/2026-43'), true);
  assert.equal(pareceNumero('Maria 2'), false);
});
test('NUP sem DV é aceito (o SIPAC busca sem ele)', () => {
  const p = validarNumero('23065.013422/2026');
  assert.equal(p.dv, '');
  assert.equal(p.formatado, '23065.013422/2026');
  assert.equal(validarNumero('230650134222026').numero, '013422');
  assert.match(erroNumero('23065.013422/2026-34'), /Dígito verificador/);
});
test('caracteres invisíveis de texto colado são ignorados', () => {
  assert.equal(validarNumero('\u206023065.013422/2026-33').formatado, '23065.013422/2026-33');
  assert.equal(validarNumero('\u200B23065.013422/2026-33\uFEFF').dv, '33');
});

const proc = {
  numero: '23065.029470/2026-43', situacao: 'ATIVO',
  dados: { 'Assunto Detalhado': 'PROGRESSÃO', 'Natureza do Processo': 'OSTENSIVO' },
  ultimaMovimentacao: { 'Destino': 'CPPD (11.01)', 'Data de Envio': '01/09/2026', 'Data de Recebimento': '03/09/2026' },
  movimentacoes: [
    { ordem: '1', destino: 'ICHCA', enviadoEm: '10/08/2026', recebidoEm: '11/08/2026', recebidoPor: 'A' },
    { ordem: '2', destino: 'CPPD (11.01)', enviadoEm: '01/09/2026', recebidoEm: '03/09/2026', recebidoPor: 'B' },
  ],
  documentos: [{ ordem: '1', tipo: 'REQUERIMENTO', data: '10/08/2026' }],
};

test('ondeEsta calcula unidade, recebimento e dias parado', () => {
  const o = ondeEsta(proc, new Date(2026, 9, 6));
  assert.equal(o.unidade, 'CPPD (11.01)');
  assert.equal(o.recebido, true);
  assert.equal(o.recebidoEm, '03/09/2026');
  assert.equal(o.diasNaUnidade, 33);
  assert.equal(o.parado, true);
});
test('mudancas detecta novo documento e mudança de unidade', () => {
  const a = foto(proc);
  const p2 = structuredClone(proc);
  p2.documentos.push({ ordem: '2', tipo: 'DESPACHO', data: '05/10/2026' });
  p2.ultimaMovimentacao.Destino = 'PROGEP';
  const m = mudancas(a, foto(p2));
  assert.ok(m.some(x => x.startsWith('Mudou de unidade')));
  assert.ok(m.some(x => x.startsWith('Novo documento')));
  assert.notEqual(assinatura(proc), assinatura(p2));
  assert.deepEqual(mudancas(null, a), []);
});
test('bloqueio de processos restritos ou sigilosos', () => {
  assert.equal(processoRestrito(proc), false);
  assert.equal(processoRestrito({ dados: { 'Natureza do Processo': 'SIGILOSO' } }), true);
  assert.equal(processoRestrito({ dados: { 'Natureza do Processo': 'RESTRITO' } }), true);
  assert.equal(ehRestrito('OSTENSIVO'), false);
});
test('schema da IA serve ao modo estrito (todos os campos obrigatórios)', () => {
  const visitar = s => {
    if (s.type === 'object') {
      assert.equal(s.additionalProperties, false);
      assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort());
      Object.values(s.properties).forEach(visitar);
    }
    if (s.type === 'array') visitar(s.items);
  };
  visitar(SCHEMA);
});

test('natureza não informada bloqueia a IA (falha segura)', () => {
  assert.equal(processoRestrito({ dados: {} }), true);
  assert.equal(processoRestrito({ dados: { 'Natureza do Processo': '' } }), true);
});
