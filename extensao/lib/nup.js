// Número Único de Processo (NUP): RRRRR.NNNNNN/AAAA-DD. Validação local, sem tocar no SIPAC.

export const RADICAL_UFAL = '23065';
const RE_NUM = /^\s*(\d{5})\s*\.?\s*(\d{1,6})\s*\/?\s*(\d{4})(?:\s*-?\s*(\d{2}))?\s*$/;

/** Tira caracteres invisíveis que vêm em texto colado (U+2060, U+200B, U+FEFF…) e apara as pontas. */
export const limpar = t => (t || '').replace(/\p{Cf}/gu, '').trim();

/** Sem letras e com dígitos: a pessoa quis digitar um número de processo. */
export const pareceNumero = t => /\d/.test(t || '') && !/\p{L}/u.test(t || '');

/** Dígitos verificadores: módulo 11, pesos decrescentes até 2; o 2º DV inclui o 1º. */
export function dvNup(base15) {
  const calc = ds => (11 - ds.reduce((s, x, i) => s + x * (ds.length + 1 - i), 0) % 11) % 10;
  const d = [...base15].map(Number);
  const d1 = calc(d);
  return `${d1}${calc([...d, d1])}`;
}

/** Retorna {radical, numero, ano, dv, formatado} ou lança Error com o motivo. DV é opcional ('' se ausente). */
export function validarNumero(texto, radicalEsperado = RADICAL_UFAL) {
  const m = limpar(texto).match(RE_NUM);
  if (!m) throw new Error('Formato inválido. Use 23065.NNNNNN/AAAA, com ou sem o DV (ex.: 23065.029470/2026-43).');
  let [, radical, numero, ano, dv = ''] = m;
  if (radical !== radicalEsperado)
    throw new Error(`Não é processo da UFAL: o número deve começar com ${radicalEsperado} (veio ${radical}).`);
  numero = numero.padStart(6, '0');
  if (+ano < 1990 || +ano > 2100) throw new Error(`Ano ${ano} inválido.`);
  if (dv && dvNup(radical + numero + ano) !== dv)
    throw new Error(`Dígito verificador não confere (${dv}). Confira o número digitado.`);
  return { radical, numero, ano, dv, formatado: `${radical}.${numero}/${ano}${dv ? '-' + dv : ''}` };
}

/** Como validarNumero, mas devolve a mensagem de erro (ou null se válido). */
export function erroNumero(texto) {
  try { validarNumero(texto); return null; } catch (e) { return e.message; }
}
